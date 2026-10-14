// Pas de console en plus de la fenêtre sous Windows, en version finale.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    padel_montage_lib::run()
}
