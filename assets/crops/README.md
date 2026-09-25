# Crop imagery

This folder is reserved for vetted, local crop photographs or illustrations. The Farmer Home and Market screens currently use resilient, crop-aware native-symbol fallbacks, so the UI never depends on remote image URLs or fails when an image is unavailable.

When assets are added, use one file per normalized crop id (for example `tomato.png`, `onion.png`) and wire it into the crop visual mapping in `src/components/agri/ui.tsx`.
