# Cigar wrapper texture

## Approach: Option B (procedural)

CC0 photo downloads (Wikimedia tobacco leaf, etc.) were unreachable from the
build environment, so a seamless dried-tobacco tile was generated offline
(FBM leaf veins + caramel / auburn color grade) and saved as PNG for Skia
`ImageShader` tiling, with cylinder lighting applied at runtime.

| File | Size | Notes |
|------|------|--------|
| `cigar-wrapper.png` | 256×512 | Project-owned procedural tile; no third-party photo rights |

Band design remains the in-shader fictional gold/navy label in `CigarDevice`.
