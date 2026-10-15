# Public commissioning input

This prepared test request selects five real public ALOHA coffee episodes (0–4), each 1,100 frames, from lerobot/aloha_static_coffee revision 1c52c4c794b6f93d931489263cf15e4331600bfc. It pins the repository's v2.0 branch commit. Current main b144896feb1f37398a862927b22cd3abdf005a6b declares v3.0 in meta/info.json, while its README still shows v2.0; using the immutable v2.0 revision removes that ambiguity from this initial selected input. The provider refs endpoint and complete 50-episode metadata were retrieved 15 October 2026. Metadata has 50 fps/four video streams; selected 110 seconds of source trajectory spans 5 episodes. No service response or quality outcome is inferred from this metadata.

The dataset card publishes MIT licensing and attributes the original ALOHA research. Preserve that attribution with any copied dataset files. This source bundle contains metadata and a request, not the 1.57 GB dataset or its image/video files.

Run only the receiver's explicit test-mode create with locally configured ann_test_ credentials during agreed commissioning. Every output must come from the actual service response and retained downloaded bytes. Existing vendor selection/support must be confirmed by the actual successful course.

Primary sources:
https://huggingface.co/datasets/lerobot/aloha_static_coffee
https://huggingface.co/api/datasets/lerobot/aloha_static_coffee/refs
https://huggingface.co/datasets/lerobot/aloha_static_coffee/raw/1c52c4c794b6f93d931489263cf15e4331600bfc/meta/info.json
https://huggingface.co/datasets/lerobot/aloha_static_coffee/raw/1c52c4c794b6f93d931489263cf15e4331600bfc/meta/episodes.jsonl
