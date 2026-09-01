use std::{env, hint::black_box, time::Instant};

use semantic_core::{ReplayEngine, ReplayScenario};

fn main() {
    let iterations = env::args()
        .nth(1)
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(10_000);
    assert!(iterations > 0, "iterations must be positive");

    let scenario = ReplayScenario::embedded_cat_grep().expect("fixture must deserialize");
    let started = Instant::now();
    let mut frame_count = 0_usize;

    for _ in 0..iterations {
        let frames = ReplayEngine::replay(black_box(&scenario)).expect("replay must remain valid");
        frame_count = black_box(frames.len());
    }

    let elapsed = started.elapsed();
    let replays_per_second = iterations as f64 / elapsed.as_secs_f64();
    let nanoseconds_per_event =
        elapsed.as_nanos() as f64 / (iterations as f64 * frame_count as f64);

    println!(
        "iterations={iterations} frames_per_replay={frame_count} elapsed_ms={} replays_per_second={replays_per_second:.2} ns_per_event={nanoseconds_per_event:.2}",
        elapsed.as_millis()
    );
}
