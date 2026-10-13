//! Tout ce qui passe par FFmpeg : sonde, forme d'onde, aperçu léger, export du montage.
//!
//! FFmpeg est un programme externe (variable PADEL_FFMPEG, sinon à côté de l'appli, sinon
//! dans le PATH). On ne le lie pas : l'appli reste sous licence permissive.

use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, UNIX_EPOCH};

pub type Result<T> = std::result::Result<T, String>;

/// Un seul travail long à la fois (aperçu ou export) ; Annuler arrête son FFmpeg.
#[derive(Default)]
pub struct Jobs {
    pub cancel: Arc<AtomicBool>,
    pub busy: Mutex<()>,
}

fn tool(name: &str) -> PathBuf {
    let var = format!("PADEL_{}", name.to_uppercase());
    if let Some(p) = std::env::var_os(var) {
        return PathBuf::from(p);
    }
    let exe = if cfg!(windows) {
        format!("{name}.exe")
    } else {
        name.to_string()
    };
    if let Some(dir) = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(Path::to_path_buf))
    {
        let local = dir.join(&exe);
        if local.exists() {
            return local;
        }
    }
    PathBuf::from(exe)
}

fn command(name: &str) -> Command {
    let mut cmd = Command::new(tool(name));
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd.stdin(Stdio::null());
    cmd
}

fn spawn_error(name: &str, e: std::io::Error) -> String {
    if e.kind() == std::io::ErrorKind::NotFound {
        format!("{name} introuvable : installez FFmpeg et ajoutez-le au PATH")
    } else {
        format!("{name} n'a pas pu démarrer : {e}")
    }
}

/// Dossier de cache de l'appli (aperçus, formes d'onde).
pub fn cache_key(video: &Path) -> String {
    let mut h = DefaultHasher::new();
    video.hash(&mut h);
    if let Ok(meta) = std::fs::metadata(video) {
        meta.len().hash(&mut h);
        if let Ok(m) = meta.modified() {
            m.duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs()
                .hash(&mut h);
        }
    }
    format!("{:016x}", h.finish())
}

// ---------- Sonde ----------

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct VideoInfo {
    duration_ms: Option<u64>,
    codec: Option<String>,
    width: Option<u32>,
    height: Option<u32>,
    playable: bool,
}

#[derive(Deserialize)]
struct ProbeOut {
    #[serde(default)]
    streams: Vec<ProbeStream>,
    format: Option<ProbeFormat>,
}

#[derive(Deserialize)]
struct ProbeStream {
    codec_name: Option<String>,
    width: Option<u32>,
    height: Option<u32>,
}

#[derive(Deserialize)]
struct ProbeFormat {
    duration: Option<String>,
}

/// Codecs que la WebView de chaque système sait lire sans extension.
fn webview_plays(codec: &str) -> bool {
    match codec {
        "h264" | "vp8" | "vp9" | "av1" => true,
        "hevc" => cfg!(target_os = "macos"),
        _ => false,
    }
}

pub fn probe(video: &Path) -> Result<VideoInfo> {
    let out = command("ffprobe")
        .args(["-v", "error", "-select_streams", "v:0"])
        .args([
            "-show_entries",
            "stream=codec_name,width,height:format=duration",
            "-of",
            "json",
        ])
        .arg(video)
        .output();
    let out = match out {
        Ok(o) if o.status.success() => o,
        // Sans ffprobe, on laisse la balise <video> essayer.
        _ => {
            return Ok(VideoInfo {
                playable: true,
                ..Default::default()
            })
        }
    };
    let p: ProbeOut = serde_json::from_slice(&out.stdout).map_err(|e| e.to_string())?;
    let s = p.streams.into_iter().next();
    let codec = s.as_ref().and_then(|s| s.codec_name.clone());
    Ok(VideoInfo {
        duration_ms: p
            .format
            .and_then(|f| f.duration)
            .and_then(|d| d.parse::<f64>().ok())
            .map(|d| (d * 1000.0).round() as u64),
        playable: codec.as_deref().map(webview_plays).unwrap_or(true),
        width: s.as_ref().and_then(|s| s.width),
        height: s.as_ref().and_then(|s| s.height),
        codec,
    })
}

// ---------- Forme d'onde ----------

const PEAK_RATE: u32 = 8000;

/// Un pic (0-255) par tranche de `bin_ms`, depuis l'audio de la vidéo, mis en cache.
pub fn peaks(video: &Path, bin_ms: u32, cache: &Path, progress: impl Fn(f64)) -> Result<Vec<u8>> {
    let cached = cache.join(format!("{}-{bin_ms}.peaks", cache_key(video)));
    if let Ok(bytes) = std::fs::read(&cached) {
        return Ok(bytes);
    }
    let total_ms = probe(video).ok().and_then(|i| i.duration_ms).unwrap_or(0);
    let mut child = command("ffmpeg")
        .args(["-v", "error", "-i"])
        .arg(video)
        .args([
            "-vn",
            "-ac",
            "1",
            "-ar",
            &PEAK_RATE.to_string(),
            "-f",
            "s16le",
            "-",
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| spawn_error("FFmpeg", e))?;
    let per_bin = ((PEAK_RATE as u64 * bin_ms as u64) / 1000).max(1) as usize;
    let mut out = Vec::with_capacity((total_ms / bin_ms.max(1) as u64) as usize + 16);
    let mut stdout = child.stdout.take().ok_or("sortie de FFmpeg indisponible")?;
    let mut buf = vec![0u8; 1 << 16];
    let mut carry: Option<u8> = None;
    let (mut count, mut max) = (0usize, 0u16);
    let mut samples: u64 = 0;
    let mut reads = 0u32;
    loop {
        let n = stdout.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        let mut bytes = &buf[..n];
        let mut pair = [0u8; 2];
        if let Some(lo) = carry.take() {
            pair = [lo, bytes[0]];
            bytes = &bytes[1..];
            push_sample(
                i16::from_le_bytes(pair),
                &mut count,
                &mut max,
                per_bin,
                &mut out,
            );
            samples += 1;
        }
        let even = bytes.len() & !1;
        for ch in bytes[..even].chunks_exact(2) {
            pair.copy_from_slice(ch);
            push_sample(
                i16::from_le_bytes(pair),
                &mut count,
                &mut max,
                per_bin,
                &mut out,
            );
        }
        samples += (even / 2) as u64;
        if even < bytes.len() {
            carry = Some(bytes[even]);
        }
        reads += 1;
        if total_ms > 0 && reads.is_multiple_of(64) {
            progress((samples * 1000 / PEAK_RATE as u64) as f64 / total_ms as f64);
        }
    }
    if count > 0 {
        out.push(scale(max));
    }
    let status = child.wait().map_err(|e| e.to_string())?;
    if !status.success() && out.is_empty() {
        let mut err = String::new();
        if let Some(mut e) = child.stderr.take() {
            let _ = e.read_to_string(&mut err);
        }
        return Err(format!("FFmpeg n'a pas pu lire le son : {}", err.trim()));
    }
    let _ = std::fs::create_dir_all(cache);
    let _ = std::fs::write(&cached, &out);
    Ok(out)
}

fn scale(max: u16) -> u8 {
    ((max as u32 * 255 + 16384) / 32768).min(255) as u8
}

fn push_sample(s: i16, count: &mut usize, max: &mut u16, per_bin: usize, out: &mut Vec<u8>) {
    let a = s.unsigned_abs();
    if a > *max {
        *max = a;
    }
    *count += 1;
    if *count == per_bin {
        out.push(scale(*max));
        *count = 0;
        *max = 0;
    }
}

// ---------- Travaux longs ----------

/// Lance FFmpeg avec `-progress`, remonte l'avancement et l'arrête si on annule.
fn run_with_progress(
    mut cmd: Command,
    jobs: &Jobs,
    span_ms: f64,
    progress: &dyn Fn(f64),
) -> Result<()> {
    cmd.args(["-progress", "pipe:1", "-nostats", "-v", "error"]);
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child: Child = cmd.spawn().map_err(|e| spawn_error("FFmpeg", e))?;
    let stdout = child.stdout.take().ok_or("sortie de FFmpeg indisponible")?;
    let mut stderr = child
        .stderr
        .take()
        .ok_or("erreurs de FFmpeg indisponibles")?;
    let err_reader = std::thread::spawn(move || {
        let mut s = String::new();
        let _ = stderr.read_to_string(&mut s);
        s
    });
    let (tx, rx) = std::sync::mpsc::channel::<f64>();
    let reader = std::thread::spawn(move || {
        for line in BufReader::new(stdout)
            .lines()
            .map_while(std::result::Result::ok)
        {
            let v = line
                .strip_prefix("out_time_us=")
                .or_else(|| line.strip_prefix("out_time_ms="));
            if let Some(us) = v.and_then(|v| v.trim().parse::<f64>().ok()) {
                let _ = tx.send(us / 1000.0);
            }
        }
    });
    loop {
        while let Ok(ms) = rx.try_recv() {
            if span_ms > 0.0 {
                progress((ms / span_ms).clamp(0.0, 1.0));
            }
        }
        if jobs.cancel.load(Ordering::SeqCst) {
            let _ = child.kill();
            let _ = child.wait();
            return Err("annulé".into());
        }
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            let _ = reader.join();
            let err = err_reader.join().unwrap_or_default();
            if status.success() {
                return Ok(());
            }
            let msg = err
                .lines()
                .rfind(|l| !l.trim().is_empty())
                .unwrap_or("erreur inconnue");
            return Err(format!("FFmpeg a échoué : {msg}"));
        }
        std::thread::sleep(Duration::from_millis(80));
    }
}

/// Encodeur H.264 disponible dans le FFmpeg installé, du meilleur au plus courant.
fn h264_encoder() -> (&'static str, Vec<&'static str>) {
    let list = command("ffmpeg")
        .args(["-hide_banner", "-encoders"])
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).into_owned())
        .unwrap_or_default();
    let has = |n: &str| list.split_whitespace().any(|w| w == n);
    if has("libx264") {
        ("libx264", vec!["-preset", "medium", "-crf", "18"])
    } else if cfg!(target_os = "macos") && has("h264_videotoolbox") {
        ("h264_videotoolbox", vec!["-b:v", "16M"])
    } else if has("h264_nvenc") {
        ("h264_nvenc", vec!["-preset", "p5", "-cq", "19"])
    } else if has("h264_qsv") {
        ("h264_qsv", vec!["-global_quality", "20"])
    } else if has("h264_amf") {
        ("h264_amf", vec!["-quality", "quality", "-b:v", "16M"])
    } else if has("h264_mf") {
        ("h264_mf", vec!["-b:v", "16M"])
    } else if has("libopenh264") {
        ("libopenh264", vec!["-b:v", "16M"])
    } else {
        ("mpeg4", vec!["-q:v", "3"])
    }
}

/// Copie légère (540p, H.264, images clés serrées pour une navigation fluide) que la
/// WebView sait lire. Mêmes instants que l'original.
pub fn make_proxy(
    video: &Path,
    cache: &Path,
    jobs: &Jobs,
    progress: &dyn Fn(f64),
) -> Result<PathBuf> {
    let out = cache.join(format!("{}.proxy.mp4", cache_key(video)));
    if out.exists() {
        return Ok(out);
    }
    std::fs::create_dir_all(cache).map_err(|e| e.to_string())?;
    let tmp = out.with_extension("part.mp4");
    let span = probe(video).ok().and_then(|i| i.duration_ms).unwrap_or(0) as f64;
    let (enc, _) = h264_encoder();
    let mut cmd = command("ffmpeg");
    cmd.args(["-y", "-i"]).arg(video);
    cmd.args([
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-vf",
        "scale=-2:540,format=yuv420p",
    ]);
    cmd.args(["-c:v", enc]);
    if enc == "libx264" {
        cmd.args(["-preset", "veryfast", "-crf", "26"]);
    } else {
        cmd.args(["-b:v", "3M"]);
    }
    cmd.args([
        "-g",
        "15",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
    ]);
    cmd.arg(&tmp);
    let r = run_with_progress(cmd, jobs, span, progress);
    if r.is_err() {
        let _ = std::fs::remove_file(&tmp);
    }
    r?;
    std::fs::rename(&tmp, &out).map_err(|e| e.to_string())?;
    Ok(out)
}

#[derive(Deserialize, Clone, Copy)]
pub struct Range {
    start: u64,
    end: u64,
}

/// Encode chaque point à part (recherche rapide, mémoire constante, ordre libre), puis les
/// met bout à bout sans réencoder.
pub fn export(
    video: &Path,
    clips: &[Range],
    out: &Path,
    jobs: &Jobs,
    progress: &dyn Fn(f64),
) -> Result<()> {
    if clips.is_empty() {
        return Err("aucun point à exporter".into());
    }
    let work = out.with_file_name(format!(
        ".{}.parts",
        out.file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default()
    ));
    std::fs::create_dir_all(&work).map_err(|e| e.to_string())?;
    let result = export_parts(video, clips, out, &work, jobs, progress);
    let _ = std::fs::remove_dir_all(&work);
    result
}

fn export_parts(
    video: &Path,
    clips: &[Range],
    out: &Path,
    work: &Path,
    jobs: &Jobs,
    progress: &dyn Fn(f64),
) -> Result<()> {
    let (enc, opts) = h264_encoder();
    let total: f64 = clips
        .iter()
        .map(|c| c.end.saturating_sub(c.start) as f64)
        .sum();
    let mut done = 0.0;
    let mut list = String::new();
    for (i, c) in clips.iter().enumerate() {
        let len = c.end.saturating_sub(c.start) as f64;
        let part = work.join(format!("{i:04}.mp4"));
        let mut cmd = command("ffmpeg");
        cmd.args(["-y", "-ss", &secs(c.start), "-i"]).arg(video);
        cmd.args([
            "-t",
            &secs(c.end - c.start),
            "-map",
            "0:v:0",
            "-map",
            "0:a:0?",
        ]);
        cmd.args(["-c:v", enc])
            .args(&opts)
            .args(["-pix_fmt", "yuv420p"]);
        cmd.args(["-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2"]);
        cmd.args([
            "-video_track_timescale",
            "90000",
            "-avoid_negative_ts",
            "make_zero",
        ]);
        cmd.arg(&part);
        let base = done;
        run_with_progress(cmd, jobs, len, &|f| {
            progress(0.97 * (base + f * len) / total)
        })?;
        done += len;
        list.push_str(&format!(
            "file '{}'\n",
            part.to_string_lossy().replace('\'', "'\\''")
        ));
    }
    let list_path = work.join("liste.txt");
    std::fs::write(&list_path, list).map_err(|e| e.to_string())?;
    let mut cmd = command("ffmpeg");
    cmd.args(["-y", "-f", "concat", "-safe", "0", "-i"])
        .arg(&list_path);
    cmd.args(["-c", "copy", "-movflags", "+faststart"]).arg(out);
    run_with_progress(cmd, jobs, 0.0, &|_| {})?;
    progress(1.0);
    Ok(())
}

fn secs(ms: u64) -> String {
    format!("{}.{:03}", ms / 1000, ms % 1000)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pics_par_tranche() {
        let mut out = Vec::new();
        let (mut count, mut max) = (0, 0);
        for s in [0i16, 100, -32768, 0, 16384, 0] {
            push_sample(s, &mut count, &mut max, 3, &mut out);
        }
        assert_eq!(out, vec![255, 128]);
    }

    #[test]
    fn secondes_a_la_milliseconde() {
        assert_eq!(secs(61_005), "61.005");
        assert_eq!(secs(999), "0.999");
    }

    #[test]
    fn hevc_seulement_sur_mac() {
        assert!(webview_plays("h264"));
        assert_eq!(webview_plays("hevc"), cfg!(target_os = "macos"));
        assert!(!webview_plays("prores"));
    }
}

/// Sur une vraie vidéo : `PADEL_TEST_VIDEO=rush.mp4 cargo test -- --ignored`.
#[cfg(test)]
mod video_tests {
    use super::*;

    #[test]
    #[ignore]
    fn sonde_onde_apercu_et_export() {
        let video = PathBuf::from(std::env::var("PADEL_TEST_VIDEO").expect("PADEL_TEST_VIDEO"));
        let work = std::env::temp_dir().join(format!("padel-media-{}", std::process::id()));
        std::fs::create_dir_all(&work).unwrap();
        let info = probe(&video).unwrap();
        assert!(info.duration_ms.unwrap() > 0);
        let p = peaks(&video, 10, &work, |_| {}).unwrap();
        let expected = info.duration_ms.unwrap() / 10;
        assert!(
            (p.len() as i64 - expected as i64).abs() < 50,
            "{} pics pour {expected}",
            p.len()
        );
        let jobs = Jobs::default();
        let out = work.join("montage.mp4");
        let clips = [
            Range {
                start: 190_000,
                end: 194_000,
            },
            Range {
                start: 180_000,
                end: 182_500,
            },
        ];
        export(&video, &clips, &out, &jobs, &|_| {}).unwrap();
        let d = probe(&out).unwrap().duration_ms.unwrap();
        assert!((6_300..=6_800).contains(&d), "durée exportée {d} ms");
        std::fs::remove_dir_all(&work).unwrap();
    }
}
