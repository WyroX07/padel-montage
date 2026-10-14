//! Côté bureau de Padel Montage : fichiers du rush, et FFmpeg pour la forme d'onde,
//! l'aperçu et l'export. L'interface est dans `app/src`.

mod media;

use media::{Jobs, Range, VideoInfo};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use tauri::ipc::{Channel, Response};
use tauri::{AppHandle, Manager, State};

type CmdResult<T> = Result<T, String>;

#[derive(Serialize)]
struct TextFile {
    name: String,
    path: String,
    text: String,
}

#[derive(Serialize)]
struct Companions {
    document: Option<TextFile>,
}

fn cache_dir(app: &AppHandle) -> CmdResult<PathBuf> {
    app.path().app_cache_dir().map_err(|e| e.to_string())
}

async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> CmdResult<T> + Send + 'static,
) -> CmdResult<T> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
fn read_text(path: String) -> CmdResult<String> {
    std::fs::read_to_string(&path).map_err(|e| format!("lecture de {path} impossible : {e}"))
}

/// Écrit d'abord à côté puis remplace : un montage n'est jamais à moitié écrit.
#[tauri::command]
fn write_text(path: String, text: String) -> CmdResult<()> {
    let target = PathBuf::from(&path);
    let tmp = target.with_extension("tmp");
    std::fs::write(&tmp, text).map_err(|e| format!("écriture de {path} impossible : {e}"))?;
    std::fs::rename(&tmp, &target).map_err(|e| format!("écriture de {path} impossible : {e}"))
}

/// Cherche à côté du rush un montage déjà commencé (`<nom>.padel-edit.json`), sinon les
/// points du détecteur (un JSON `padel-rallies/v1` dont le nom commence comme la vidéo).
#[tauri::command]
fn companions(video: String) -> Companions {
    Companions {
        document: find_companion(Path::new(&video)),
    }
}

fn find_companion(video: &Path) -> Option<TextFile> {
    let dir = video.parent()?;
    let stem = video.file_stem()?.to_string_lossy().to_lowercase();
    let read = |p: PathBuf| -> Option<TextFile> {
        let text = std::fs::read_to_string(&p).ok()?;
        Some(TextFile {
            name: p.file_name()?.to_string_lossy().into_owned(),
            path: p.to_string_lossy().into_owned(),
            text,
        })
    };
    let edit = dir.join(format!(
        "{}.padel-edit.json",
        video.file_stem()?.to_string_lossy()
    ));
    if edit.exists() {
        return read(edit);
    }
    let mut best: Option<(u8, TextFile)> = None;
    for entry in std::fs::read_dir(dir).ok()?.flatten() {
        let p = entry.path();
        let name = p
            .file_name()
            .map(|n| n.to_string_lossy().to_lowercase())
            .unwrap_or_default();
        if !name.ends_with(".json") || !name.starts_with(&stem) {
            continue;
        }
        let Some(file) = read(p) else { continue };
        let Ok(json) = serde_json::from_str::<serde_json::Value>(&file.text) else {
            continue;
        };
        let rank = match (json["format"].as_str(), json["source"].as_str()) {
            (Some("padel-edit/v1"), _) => 3,
            (Some("padel-rallies/v1"), Some("prediction")) => 2,
            (Some("padel-rallies/v1"), _) => 1,
            _ => continue,
        };
        if best.as_ref().is_none_or(|(r, _)| rank > *r) {
            best = Some((rank, file));
        }
    }
    best.map(|(_, f)| f)
}

#[tauri::command]
async fn probe_video(video: String) -> CmdResult<VideoInfo> {
    blocking(move || media::probe(Path::new(&video))).await
}

#[tauri::command]
async fn audio_peaks(
    app: AppHandle,
    video: String,
    bin_ms: u32,
    on_progress: Channel<f64>,
) -> CmdResult<Response> {
    let cache = cache_dir(&app)?.join("peaks");
    let bytes = blocking(move || {
        media::peaks(Path::new(&video), bin_ms, &cache, |f| {
            let _ = on_progress.send(f);
        })
    })
    .await?;
    Ok(Response::new(bytes))
}

#[tauri::command]
async fn make_proxy(
    app: AppHandle,
    jobs: State<'_, std::sync::Arc<Jobs>>,
    video: String,
    on_progress: Channel<f64>,
) -> CmdResult<String> {
    let cache = cache_dir(&app)?.join("proxies");
    let jobs = jobs.inner().clone();
    blocking(move || {
        let _guard = jobs
            .busy
            .try_lock()
            .map_err(|_| "une autre tâche est en cours")?;
        jobs.cancel.store(false, Ordering::SeqCst);
        let p = media::make_proxy(Path::new(&video), &cache, &jobs, &|f| {
            let _ = on_progress.send(f);
        })?;
        Ok(p.to_string_lossy().into_owned())
    })
    .await
}

#[tauri::command]
async fn export_montage(
    jobs: State<'_, std::sync::Arc<Jobs>>,
    video: String,
    clips: Vec<Range>,
    out: String,
    on_progress: Channel<f64>,
) -> CmdResult<()> {
    let jobs = jobs.inner().clone();
    blocking(move || {
        let _guard = jobs
            .busy
            .try_lock()
            .map_err(|_| "une autre tâche est en cours")?;
        jobs.cancel.store(false, Ordering::SeqCst);
        media::export(Path::new(&video), &clips, Path::new(&out), &jobs, &|f| {
            let _ = on_progress.send(f);
        })
    })
    .await
}

#[tauri::command]
fn cancel_job(jobs: State<'_, std::sync::Arc<Jobs>>) {
    jobs.cancel.store(true, Ordering::SeqCst);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(std::sync::Arc::new(Jobs::default()))
        .invoke_handler(tauri::generate_handler![
            read_text,
            write_text,
            companions,
            probe_video,
            audio_peaks,
            make_proxy,
            export_montage,
            cancel_job
        ])
        .run(tauri::generate_context!())
        .expect("impossible de démarrer Padel Montage");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trouve_le_montage_puis_les_predictions() {
        let dir = std::env::temp_dir().join(format!("padel-companions-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let video = dir.join("match.MOV");
        std::fs::write(&video, b"").unwrap();
        let rallies = |source: &str| {
            format!(r#"{{"format":"padel-rallies/v1","source":"{source}","rallies":[]}}"#)
        };
        std::fs::write(dir.join("match_verite.json"), rallies("ground_truth")).unwrap();
        std::fs::write(dir.join("autre.json"), rallies("prediction")).unwrap();
        assert_eq!(find_companion(&video).unwrap().name, "match_verite.json");
        std::fs::write(
            dir.join("match_pre_annotation_v0.json"),
            rallies("prediction"),
        )
        .unwrap();
        assert_eq!(
            find_companion(&video).unwrap().name,
            "match_pre_annotation_v0.json"
        );
        std::fs::write(
            dir.join("match.padel-edit.json"),
            r#"{"format":"padel-edit/v1","clips":[]}"#,
        )
        .unwrap();
        assert_eq!(
            find_companion(&video).unwrap().name,
            "match.padel-edit.json"
        );
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
