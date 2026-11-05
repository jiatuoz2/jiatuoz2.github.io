# Builds the 3D model of a "My Journey" artifact, assets/models/journey/<id>.glb, from its photo cutout, plus a
# turntable preview to judge it by. The board keeps showing the flat cutout; only the examine window loads the model.
# The settings for each artifact (source cutouts, seed, sampler settings, turn, real size, verdict) live in
# bin/journey_models.json, so a run can be repeated exactly.
#
# Generator: TRELLIS (https://github.com/microsoft/TRELLIS, model microsoft/TRELLIS-image-large), MIT licence for
# code and weights. It conditions on DINOv2 (Apache-2.0). Its GLB export bakes the texture with nvdiffrast, whose
# licence (NVIDIA Source Code License) allows non-commercial use only; that covers running it for this site. The
# generator puts no licence of its own on the output, but a model made from a CC BY-SA photo is an adaptation of that
# photo and stays CC BY-SA (see assets/img/journey/CREDITS.md). The other candidates were ruled out:
# - Hunyuan3D-2: its licence forbids showing outputs outside its territory, which excludes the EU, UK and South
#   Korea. A public website can't promise that.
# - TRELLIS.2 and Stable Fast 3D: both need gated Hugging Face models (facebook/dinov3-vitl16-pretrain-lvd1689m,
#   stabilityai/stable-fast-3d) whose licences the owner hasn't accepted.
# - TripoSR: gives vertex colour only.
#
# The generator runs from its own environment outside the repository, C:/Users/charl/tools/journey-3d, never from
# the Anaconda base env. To set it up once, in Git Bash with VS 2022 Build Tools (x64) installed:
#   J=C:/Users/charl/tools/journey-3d
#   conda create -y -p $J/env python=3.10
#   conda install -y -p $J/env -c nvidia/label/cuda-12.4.1 cuda-toolkit
#   $J/env/python.exe -m pip install torch==2.5.0 torchvision==0.20.0 xformers==0.0.28.post2 \
#       --index-url https://download.pytorch.org/whl/cu124
#   $J/env/python.exe -m pip install pillow imageio imageio-ffmpeg tqdm easydict opencv-python-headless scipy ninja \
#       rembg onnxruntime trimesh open3d xatlas pyvista pymeshfix igraph "transformers<4.50" spconv-cu120 pygltflib \
#       "numpy<2" git+https://github.com/EasternJournalist/utils3d.git@9a4eb15e4021b67b12c460c7057d642626897ec8
#   git clone --recursive https://github.com/microsoft/TRELLIS.git $J/TRELLIS          (used at commit 193e050)
#   git clone -b v0.4.0 https://github.com/NVlabs/nvdiffrast.git $J/ext/nvdiffrast
#   git clone https://github.com/autonomousvision/mip-splatting.git $J/ext/mip-splatting
# Then build the two CUDA extensions from cmd.exe, after `call %J%\buildenv.bat`. That script runs vcvars64.bat and
# sets CUDA_HOME=%J%\env, DISTUTILS_USE_SDK=1 and TORCH_CUDA_ARCH_LIST=8.9 (RTX 4080 SUPER):
#   python -m pip install --no-build-isolation %J%\ext\nvdiffrast
#   python -m pip install --no-build-isolation %J%\ext\mip-splatting\submodules\diff-gaussian-rasterization
# TRELLIS uses kaolin only for an argument check, and kaolin has no Windows wheel for this torch, so this script
# stubs it. flash-attn has no Windows wheel either, so attention runs on xformers.
#
# Usage, from the repository root (J as above):
#   $J/env/python.exe bin/build_journey_models.py <id>               writes the model with the seed in the table
#   $J/env/python.exe bin/build_journey_models.py <id> --try 1-6     writes candidates and previews only, under
#                                                                    $J/out/<id>/, to choose a seed
#   $J/env/python.exe bin/build_journey_models.py <id> --seed 4      writes the model with seed 4 and records it
#   $J/env/python.exe bin/build_journey_models.py <id> --adopt 4     writes the --try candidate for seed 4 to the repo
#                                                                    as it is (no regeneration) and records it as kept
#   $J/env/python.exe bin/build_journey_models.py <id> --fit-pose [N]  prints the photo's camera (yaw, pitch, fov) for
#                                                                    the model, or for candidate N, by matching the
#                                                                    cutout; the viewer's model_yaw is minus that yaw
#   --preview-dir DIR puts the preview PNGs somewhere other than $J/previews. The previews show every side (front,
#   both sides, back, top): look at the far side too, where TRELLIS invents what the photo hides.
# Fixes in the table, applied in this order by every build (a --try candidate already has them, so --adopt doesn't
# apply them again; after changing them, rebuild with --seed N rather than adopting an older candidate):
# - "true_extents_m": [x, y, z], the real size; each axis is scaled to it (TRELLIS guesses depth from one photo).
# - "flatten_top": levels the top face inside that fraction of the edges (a dimple TRELLIS read into a flush window).
# - "square_off": {"exponent": n} makes the footprint the symmetric rounded square (superellipse) the object really is;
#   TRELLIS made the Linktop's lopsided (see square_off()).
# - "remove_boxes": [[x0, y0, z0, x1, y1, z1], ...] in the finished frame (centred, longest side 1, +Y up) deletes what
#   lies inside, with the scraps it leaves: the second ball and roller arm TRELLIS mirrored onto the 2019 robot's far
#   side, and the shard-strewn floor under them. Render the candidate from all sides first and read the coordinates
#   off the mesh. "debris" (default 200 faces) is the largest loose scrap near a box that goes with it.
# - "hue_fix": a list of [from, to, shift] in degrees, moves saturated colours TRELLIS shifted back.
# - "patches": [{"sphere": [x, y, z, r] or "plate": [x0, y0, z0, x1, y1, z1], "rgb": [r, g, b]}, ...] fills what a
#   cut uncovers (a sphere can also "clear" the dark smear on that side of the ball it mends).
# - "project": {"yaw", "pitch", "fov"}, the photo's camera from --fit-pose, paints the photo back onto the faces it
#   shows, so the first frame of the model is the photo (TRELLIS garbles fine print such as a brand name). A list of
#   cameras paints from each in turn; one with "below_y" (finished frame) paints only below that height, one with
#   "min_up" only on faces turned up at least that far (the Linktop's top, not its steeply seen walls). The 2019
#   robot's second camera, turned 180 degrees, paints the photo's bumpers ("744") onto the back and left bumpers,
#   which TRELLIS lettered in gibberish: a square robot turned half round puts its far bumpers where the near ones
#   were.
# - "bumper_text": relabels the 2019 robot's bumpers after "project": the white marks TRELLIS lettered them with are
#   painted out with the fabric's blue and a clean "744" is drawn on each face, in the box given for it, in a system
#   font (Bahnschrift Bold, which Windows ships) close to the bumpers' vinyl numbers. The boxes on the two faces the
#   photo shows are where its 744s land on the model, so the first frame still matches the cutout; the far two follow
#   Jiatuo's photo of the other side (the robot turned half round). See bumper_text() for the fields.
# - "repaint": [{"box", tests, "rgb"?}, ...] repaints the texels in a box that pass colour tests, with a colour or with
#   what surrounds them: a strip of the photo's green roller "project" laid on the robot's far panel, the dark gap
#   along its far frame rail, the back port window TRELLIS copied onto the Linktop from its front (see repaint()).
# - "pad_gutters": true fills the atlas between the texture's charts with the colour of the nearest chart, so no
#   thin dark line shows along a seam. It does no harm applied twice, so --adopt applies it too.
# - "mirror_copy": copies the robot's near bay floor (wiring, as the photo paints it) into the far bay, mirrored, last
#   of all (see mirror_copy()).
#
# To add an artifact, for example a watch on the SensorClaw doc (id sensorclaw on the Evanston board):
#   $J/env/python.exe bin/build_journey_models.py sensorclaw-pixel-watch --size-m 0.045 \
#       --photos D:/photos/watch-front.jpg D:/photos/watch-side.jpg D:/photos/watch-back.jpg --board-image
# This cuts each photo out with rembg's birefnet-general model, the one used for the robot cutouts. The cutouts go to
# $J/inputs/<id>/ (outside the repo, without metadata such as GPS). It adds the artifact to bin/journey_models.json,
# makes candidates for seeds 1-4 with previews, and writes the seed-1 model. With --board-image it also writes the
# flat board cutout, assets/img/journey/artifacts/<id>.png, from the first photo. Then look at the previews. Rerun
# with --seed N if another candidate is better, or set "status": "reject" if none is good. Add the yml entry
# (kind: artifact, attach: sensorclaw) and a CREDITS.md row by hand.
#
# Several photos of one object: list them all in "sources", first photo the one the board shows. TRELLIS then
# conditions on every view at each sampling step (run_multi_image). "multi_image_mode" is "stochastic" (the default:
# each step takes one view in turn) or "multidiffusion" (each step averages all views; steadier, sometimes blurrier).
# Photos work best taken at about the same distance, with the whole object in frame and soft, even light: front,
# both sides and back. Hidden sides are otherwise inferred, so a back photo matters most.
#
# Imported models. An entry with an "import" block is built from an existing glTF binary instead of TRELLIS. At
# Jiatuo's request the Pixel Watch (sensorclaw-pixel-watch) is Google's own Pixel Watch 3 model, from Google's
# "Explore Pixel Watch 3 in 3D" (linked from the Google Store; (c) Google, no licence stated, so not openly licensed;
# see assets/img/journey/CREDITS.md), adapted to Jiatuo's watch as the cutout shows it:
#   $J/env/python.exe -m pip install DracoPy                                   once: the Draco decoder
#   $J/env/python.exe bin/build_journey_models.py sensorclaw-pixel-watch       writes the model ([--import] is implied)
#   $J/env/python.exe bin/build_journey_models.py sensorclaw-pixel-watch --source D:/D004.glb
# It fetches "url" once into $J/downloads/<id>/ (or takes --source, a copy downloaded by hand) and checks "sha256"
# before using it; the file is only read, nothing in it runs, and no generator or GPU is needed. The block's fields,
# applied in this order (see import_model() and the functions it calls):
# - "variant": the KHR_materials_variants variant whose materials are baked in; "drop_nodes": nodes left out (the
#   invisible AR shadow mesh). Draco is decoded and the file is written plain, with no extensions at all.
# - "band": lays a band modelled closed round a wrist out flat and open (lay_band_flat(), Strap): "node"; "post_node",
#   the pin, moved in one piece with the strap that carries it ("post_strap", the lug that strap leaves in the
#   source, "12" or "6"); "swap", the straps change lugs; "root_mm", "bend_mm", "touch_mm": each strap stays fixed to
#   its lug for root_mm, turns from the loop's way over bend_mm, and droops to the table by touch_mm from the lug;
#   "straps": {"12"|"6": {"remap": [[from_mm, to_mm, factor], ...]}} shortens (factor below 1) plain stretches of a
#   strap, in mm along the source strap from its lug, so its holes, slots and pin land where the cutout's are;
#   "clear_occlusion": {"keep_mm", "keep_uv"} (clear_occlusion()).
# - "case_node", "case_across_m", "keep_thickness", "keep_size": the real size (import_geometry()).
# - "rotate_deg": the turn into the site's frame (+Y up), then centred with its longest side 1, as finish() does.
# - "materials": {source material name: {"name", "rgb" (sRGB), "metallic", "roughness"}}.
# - "screen": the screen's picture, cut from the cutout, as its emissive texture (screen_image()).
# - "texture_max", "jpeg_quality": the textures kept, re-encoded; "copyright" goes in the file's asset block.
# Its first frame is fitted like a generated model's, with bin/fit_journey_model_pose.js.
import argparse, io, json, math, os, re, shutil, sys, types
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps

REPO = Path(__file__).resolve().parent.parent
TABLE = REPO / "bin" / "journey_models.json"
TOOLS = Path(os.environ.get("JOURNEY_3D", "C:/Users/charl/tools/journey-3d"))
MODELS = REPO / "assets" / "models" / "journey"
GENERATOR = "TRELLIS-image-large (microsoft/TRELLIS @ 193e050), MIT"

# Keep every download (TRELLIS weights, DINOv2, rembg models) inside the tools folder rather than the user caches.
os.environ.setdefault("HF_HOME", str(TOOLS / "hf"))
os.environ.setdefault("TORCH_HOME", str(TOOLS / "torch"))
os.environ.setdefault("U2NET_HOME", str(TOOLS / "u2net"))
os.environ.setdefault("ATTN_BACKEND", "xformers")
os.environ.setdefault("SPCONV_ALGO", "native")
os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")


def load_table():
    return json.loads(TABLE.read_text(encoding="utf-8"))


def _breaks(value):
    # Prettier always puts the items of a list of two or more lists or objects on lines of their own.
    return isinstance(value, list) and len(value) > 1 and all(isinstance(v, (dict, list)) and len(v) > 1 for v in value)


def _flat(value):
    # A value on one line, spaced as prettier spaces it: { "a": 1 }, [1, 2].
    if isinstance(value, dict):
        return "{ " + ", ".join(f"{json.dumps(k, ensure_ascii=False)}: {_flat(v)}" for k, v in value.items()) + " }" if value else "{}"
    if isinstance(value, list):
        return "[" + ", ".join(_flat(v) for v in value) + "]"
    return json.dumps(value, ensure_ascii=False)


def dump_json(value, indent=0, room=150):
    # Writes the table the way prettier formats it (objects open, scalar lists on one line when they fit the 150
    # columns of .prettierrc), so rerunning the script leaves `npx prettier --check .` passing. room is what is left
    # of the line for the value.
    pad = "  " * indent
    if isinstance(value, dict):
        if not value:
            return "{}"
        lines = []
        for k, v in value.items():
            key = f"{pad}  {json.dumps(k, ensure_ascii=False)}: "
            lines.append(key + dump_json(v, indent + 1, 150 - len(key) - 1))
        inner = ",\n".join(lines)
        flat = "{ " + ", ".join(f"{json.dumps(k)}: {json.dumps(v)}" for k, v in value.items()) + " }"
        if indent > 1 and all(not isinstance(v, (dict, list)) for v in value.values()) and len(pad) + len(flat) < 120:
            return flat
        return "{\n" + inner + "\n" + pad + "}"
    if isinstance(value, list):
        # Like prettier, a list of two or more lists or objects puts each on its own line (remove_boxes, patches),
        # an object in it on one line when it fits.
        if _breaks(value):
            items = []
            for v in value:
                flat = _flat(v)
                # An object holding a list that breaks (a patch's list of "clear" directions) breaks with it.
                fits = len(pad) + 2 + len(flat) < 150 and not (isinstance(v, dict) and any(_breaks(x) for x in v.values()))
                items.append(f"{pad}  {flat}" if fits else f"{pad}  {dump_json(v, indent + 1)}")
            return "[\n" + ",\n".join(items) + "\n" + pad + "]"
        flat = "[" + ", ".join(_flat(v) for v in value) + "]"
        if len(flat) > room and len(value) > 1:
            return "[\n" + ",\n".join(f"{pad}  {json.dumps(v, ensure_ascii=False)}" for v in value) + "\n" + pad + "]"
        return flat
    return json.dumps(value, ensure_ascii=False)


def save_table(table):
    # newline="\n": on Windows write_text would otherwise end the lines with CRLF, which prettier flags.
    TABLE.write_text(dump_json(table) + "\n", encoding="utf-8", newline="\n")


def settings(table, art_id):
    if art_id not in table["artifacts"]:
        sys.exit(f"{art_id} is not in {TABLE.name}; pass --photos and --size-m to add it")
    return {**table["defaults"], **table["artifacts"][art_id]}


def source_path(cfg, i=0):
    s = cfg["sources"][i]
    return Path(s) if Path(s).is_absolute() else REPO / s


def parse_seeds(text):
    seeds = []
    for part in text.split(","):
        if "-" in part:
            a, b = part.split("-")
            seeds += range(int(a), int(b) + 1)
        else:
            seeds.append(int(part))
    return seeds


# ---------------------------------------------------------------------------------------------------- cutouts


def cut_out(photo, out_png, max_side=2048):
    # Same approach as the robot cutouts: rembg's birefnet-general mask on the photo, then a tight crop. Saving a fresh
    # PNG drops EXIF, so no camera or GPS data comes along.
    from rembg import new_session, remove

    im = ImageOps.exif_transpose(Image.open(photo)).convert("RGB")
    im.thumbnail((max_side, max_side), Image.LANCZOS)
    mask = remove(im, session=new_session("birefnet-general"), only_mask=True)
    rgba = im.copy()
    rgba.putalpha(mask)
    box = mask.point(lambda a: 255 if a > 24 else 0).getbbox()
    if box is None:
        sys.exit(f"no object found in {photo}")
    m = round(0.02 * max(im.size))
    box = (max(0, box[0] - m), max(0, box[1] - m), min(im.width, box[2] + m), min(im.height, box[3] + m))
    out_png.parent.mkdir(parents=True, exist_ok=True)
    rgba.crop(box).save(out_png, optimize=True)
    return out_png


def board_image(cutout, art_id, width=900):
    # The flat cutout the board shows, sized like the other artifact PNGs.
    im = Image.open(cutout).convert("RGBA")
    if im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    out = REPO / "assets" / "img" / "journey" / "artifacts" / f"{art_id}.png"
    im.save(out, optimize=True)
    return out


# ---------------------------------------------------------------------------------------------------- generation

_pipeline = None


def pipeline():
    global _pipeline
    if _pipeline is None:
        # kaolin.utils.testing.check_tensor only validates argument shapes inside FlexiCubes.
        testing = types.ModuleType("kaolin.utils.testing")
        testing.check_tensor = lambda *a, **k: True
        utils = types.ModuleType("kaolin.utils")
        utils.testing = testing
        kaolin = types.ModuleType("kaolin")
        kaolin.utils = utils
        sys.modules.update({"kaolin": kaolin, "kaolin.utils": utils, "kaolin.utils.testing": testing})
        sys.path.insert(0, str(TOOLS / "TRELLIS"))
        # xformers 0.0.28 keeps BlockDiagonalMask only under fmha.attn_bias, where TRELLIS doesn't look.
        import xformers.ops.fmha as fmha

        if not hasattr(fmha, "BlockDiagonalMask"):
            fmha.BlockDiagonalMask = fmha.attn_bias.BlockDiagonalMask
        from trellis.pipelines import TrellisImageTo3DPipeline

        _pipeline = TrellisImageTo3DPipeline.from_pretrained("microsoft/TRELLIS-image-large")
        _pipeline.cuda()
    return _pipeline


def generate(cfg, seed, target_triangles):
    pipe = pipeline()  # first: it puts TRELLIS on the import path
    from trellis.utils import postprocessing_utils

    images = [Image.open(REPO / s if not Path(s).is_absolute() else s).convert("RGBA") for s in cfg["sources"]]
    kwargs = dict(
        seed=seed,
        sparse_structure_sampler_params=cfg["sparse_structure_sampler"],
        slat_sampler_params=cfg["slat_sampler"],
        formats=["gaussian", "mesh"],
    )
    if len(images) == 1:
        out = pipe.run(images[0], **kwargs)
    else:
        out = pipe.run_multi_image(images, mode=cfg["multi_image_mode"], **kwargs)
    raw_faces = out["mesh"][0].faces.shape[0]
    # to_glb removes this share of the faces before unwrapping and baking; hole filling adds a few back, hence 0.9.
    simplify = min(0.98, max(0.0, 1 - 0.9 * target_triangles / raw_faces))
    mesh = postprocessing_utils.to_glb(
        out["gaussian"][0], out["mesh"][0], simplify=simplify, texture_size=cfg["texture_size"], verbose=False
    )
    return mesh, raw_faces


# ---------------------------------------------------------------------------------------------------- finishing


def jpeg(img, quality):
    buf = io.BytesIO()
    img.convert("RGB").save(buf, "JPEG", quality=quality, optimize=True)
    return Image.open(io.BytesIO(buf.getvalue()))


def fix_hues(texture, bands):
    # TRELLIS can shift a saturated colour by 20-30 degrees of hue (the 2019 robot's orange ball came out yellow).
    # Each band [from, to, shift] in degrees moves the saturated pixels in that hue range back by shift.
    if not bands:
        return texture
    hsv = np.asarray(texture.convert("RGB").convert("HSV")).astype(np.int16)
    h = hsv[..., 0].astype(np.float32) * 360 / 255
    for lo, hi, shift in bands:
        sel = (h >= lo) & (h < hi) & (hsv[..., 1] > 90)
        h = np.where(sel, (h + shift) % 360, h)
    hsv[..., 0] = np.round(h * 255 / 360).astype(np.int16) % 256
    return Image.fromarray(hsv.astype(np.uint8), "HSV").convert("RGB")


def square_off(mesh, spec):
    # TRELLIS made the Linktop's footprint lopsided: from above, one corner juts about 2.5% further out than the one
    # opposite it, and its sides bow unevenly, so the outline drawn from the photo's camera did not lie on the cutout's
    # (a ghost of the photo's edge showed mid-fade). The real device is a symmetric rounded square, a superellipse
    # |x|^n + |z|^n = a^n of half-width a; Jiatuo's square-on photo of its top (linktop-top-diagonal.jpg: corner to
    # corner 1.06 times flat to flat) gives n about 2.4. spec is {"exponent": n}. Every vertex keeps its angle round
    # the vertical axis and its height, and its distance from the axis is scaled by the superellipse's radius over the
    # mesh's own outline at that angle (its furthest vertex, smoothed over a few degrees), so the rounded edge keeps
    # its profile and the top face its print, and the outline becomes the superellipse at every height alike.
    from scipy.ndimage import uniform_filter1d

    n = float(spec["exponent"])
    v = mesh.vertices.copy()
    lo, hi = mesh.bounds
    centre = (lo + hi) / 2
    x, z = v[:, 0] - centre[0], v[:, 2] - centre[2]
    angle, radius = np.arctan2(z, x), np.hypot(x, z)
    bins = 360
    index = np.clip(((angle + np.pi) / (2 * np.pi) * bins).astype(int), 0, bins - 1)
    outline = np.zeros(bins)
    np.maximum.at(outline, index, radius)
    # Empty bins (none in a dense mesh) take their neighbours' radius; then a 5-degree running mean, round the circle.
    filled = outline > 0
    outline = np.interp(np.arange(bins), np.nonzero(filled)[0], outline[filled], period=bins)
    outline = uniform_filter1d(outline, 5, mode="wrap")
    a = 0.5 * max(hi[0] - lo[0], hi[2] - lo[2])
    target = a / (np.abs(np.cos(angle)) ** n + np.abs(np.sin(angle)) ** n) ** (1 / n)
    scale = target / outline[index]
    v[:, 0] = centre[0] + x * scale
    v[:, 2] = centre[2] + z * scale
    # Centred again, at the width it had (the outline's mean radius is not its extreme).
    v[:, [0, 2]] -= (v[:, [0, 2]].max(0) + v[:, [0, 2]].min(0)) / 2 - centre[[0, 2]]
    v[:, [0, 2]] = centre[[0, 2]] + (v[:, [0, 2]] - centre[[0, 2]]) * (hi - lo)[[0, 2]] / (v[:, [0, 2]].max(0) - v[:, [0, 2]].min(0))
    mesh.vertices = v
    print(f"square_off: outline radius {outline.min():.3f}-{outline.max():.3f}, now the superellipse n={n}", file=sys.stderr)
    return mesh


def remove_boxes(mesh, boxes, debris=200):
    # TRELLIS tends to mirror what one photo shows onto the side it can't see: the 2019 robot got a second ball and
    # a second intake arm on its far side. Each box [x0, y0, z0, x1, y1, z1], in the finished model's frame (centred,
    # longest side 1, +Y up, before size_m), deletes the faces whose centres fall inside it. The cut leaves loose
    # scraps that belonged to the removed part (a roller end, a sliver of ball), so afterwards any piece of fewer than
    # `debris` faces that lies mostly inside a box, grown by 0.04, goes too. Bigger pieces, such as the frame that
    # passes through a box, stay.
    import trimesh

    if not boxes:
        return mesh
    centres = mesh.triangles_center
    boxes = np.asarray(boxes, dtype=float).reshape(-1, 6)

    def inside(points, grow=0.0):
        hit = np.zeros(len(points), bool)
        for b in boxes:
            hit |= np.all((points >= b[:3] - grow) & (points <= b[3:] + grow), axis=1)
        return hit

    keep = ~inside(centres)
    labels = trimesh.graph.connected_component_labels(mesh.face_adjacency, node_count=len(mesh.faces))
    labels[~keep] = -1
    near = inside(centres, 0.04)
    for label in np.unique(labels[keep]):
        piece = labels == label
        if piece.sum() < debris and near[piece].mean() > 0.5:
            keep &= ~piece
    removed = int((~keep).sum())
    mesh.update_faces(keep)
    mesh.remove_unreferenced_vertices()
    print(f"remove_boxes: deleted {removed} faces", file=sys.stderr)
    return mesh


def add_patches(mesh, texture, patches):
    # Fills what a cut uncovers. Where two parts touched, TRELLIS made no surface: with the far ball gone, the near
    # ball has a dark hole in its back and the deck under it has gaps. Each patch is {"sphere": [x, y, z, r]} or
    # {"plate": [x0, y0, z0, x1, y1, z1]} in the same frame as the boxes, with "rgb": [r, g, b]. It is set slightly
    # inside the surface it mends, so it only shows through the gaps. A sphere can also carry "clear": [dx, dy, dz],
    # which first deletes the faces of its shell (0.8r to 1.25r out) on the half facing that way that are dark or
    # about the patch's colour: the contact patch TRELLIS left on the ball's back is a dark, lumpy smear, not a gap,
    # and the side no photo shows is better as a clean ball. "clear" may also be a list of directions, to clear the
    # half facing each (on the ball: away from the cut copy, and away from the photo's camera, whose hidden half was
    # flecked with dark scraps). A patch's colour is painted as a small swatch into an
    # unused corner of the texture atlas, and every vertex of the patch maps to that swatch.
    import trimesh
    from scipy.ndimage import binary_erosion

    if not patches:
        return mesh, texture
    texture = texture.convert("RGB").copy()
    w, h = texture.size
    pixels = np.asarray(texture).astype(np.int16)
    value = pixels.max(axis=2)
    for patch in patches:
        if "sphere" in patch and "clear" in patch:
            centre, r = np.asarray(patch["sphere"][:3], dtype=float), patch["sphere"][3]
            toward = np.asarray(patch["clear"], dtype=float).reshape(-1, 3)
            offset = mesh.triangles_center - centre
            dist = np.linalg.norm(offset, axis=1)
            uv = mesh.visual.uv[mesh.faces].mean(1)
            px = np.clip((uv[:, 0] * w).astype(int), 0, w - 1)
            py = np.clip(((1 - uv[:, 1]) * h).astype(int), 0, h - 1)
            facing = np.any(offset @ (toward / np.linalg.norm(toward, axis=1, keepdims=True)).T > 0.1 * dist[:, None], axis=1)
            near_colour = np.abs(pixels[py, px] - np.asarray(patch["rgb"])).max(axis=1) < 60
            drop = (dist > 0.8 * r) & (dist < 1.25 * r) & facing & ((value[py, px] < 90) | near_colour)
            mesh.update_faces(~drop)
            mesh.remove_unreferenced_vertices()
    cell = 16
    used = Image.new("L", (w // cell, h // cell), 0)
    draw = ImageDraw.Draw(used)
    for tri in mesh.visual.uv[mesh.faces]:
        draw.polygon([(u * w / cell, (1 - v) * h / cell) for u, v in tri], fill=255, outline=255)
    free = np.argwhere(binary_erosion(np.asarray(used) == 0, np.ones((5, 5)), border_value=0))
    vertices, faces, uvs, taken = [mesh.vertices], [mesh.faces], [mesh.visual.uv], []
    count = len(mesh.vertices)
    paint = ImageDraw.Draw(texture)
    for patch in patches:
        spot = next((c for c in free if all(np.abs(c - t).max() > 5 for t in taken)), None)
        if spot is None:
            sys.exit("no free room in the texture atlas for a patch swatch")
        taken.append(spot)
        cy, cx = spot
        paint.rectangle([(cx - 2) * cell, (cy - 2) * cell, (cx + 3) * cell - 1, (cy + 3) * cell - 1], fill=tuple(patch["rgb"]))
        if "sphere" in patch:
            x, y, z, r = patch["sphere"]
            part = trimesh.creation.icosphere(subdivisions=4, radius=r)
            part.apply_translation([x, y, z])
        else:
            b = np.asarray(patch["plate"], dtype=float)
            part = trimesh.creation.box(extents=b[3:] - b[:3])
            part.apply_translation((b[:3] + b[3:]) / 2)
        vertices.append(part.vertices)
        faces.append(part.faces + count)
        uvs.append(np.tile([(cx + 0.5) * cell / w, 1 - (cy + 0.5) * cell / h], (len(part.vertices), 1)))
        count += len(part.vertices)
    visual = trimesh.visual.TextureVisuals(uv=np.vstack(uvs), image=texture)
    mesh = trimesh.Trimesh(np.vstack(vertices), np.vstack(faces), visual=visual, process=False)
    return mesh, texture


def camera(yaw, pitch, fov, distance=2.3):
    # The preview camera: on a sphere round the model, yaw degrees from +Z toward +X and pitch degrees up, looking at
    # the centre. Returns the eye and the view-projection matrix.
    a, p = math.radians(yaw), math.radians(pitch)
    eye = distance * np.array([math.sin(a) * math.cos(p), math.sin(p), math.cos(a) * math.cos(p)])
    proj = np.zeros((4, 4))
    proj[0, 0] = proj[1, 1] = 1 / math.tan(math.radians(fov) / 2)
    proj[2, 2], proj[2, 3], proj[3, 2] = -(10 + 0.1) / (10 - 0.1), -2 * 10 * 0.1 / (10 - 0.1), -1
    return eye, proj @ look_at(eye)


class Shots:
    # Rasterises a mesh from the preview camera with nvdiffrast. Rows of every buffer run top to bottom, as in images.
    def __init__(self, mesh, texture):
        import torch
        import nvdiffrast.torch as dr

        self.torch, self.dr, dev = torch, dr, "cuda"
        self.ctx = dr.RasterizeCudaContext()
        self.v = torch.tensor(mesh.vertices, dtype=torch.float32, device=dev)
        self.f = torch.tensor(mesh.faces, dtype=torch.int32, device=dev)
        uv = torch.tensor(mesh.visual.uv, dtype=torch.float32, device=dev)
        self.uv = uv
        self.uv_tex = torch.stack([uv[:, 0], 1 - uv[:, 1]], 1)
        self.n = torch.tensor(np.asarray(mesh.vertex_normals), dtype=torch.float32, device=dev)
        self.tex = torch.tensor(np.asarray(texture.convert("RGB"), dtype=np.float32) / 255, device=dev)[None]

    def shoot(self, yaw, pitch, fov, size):
        torch, dr = self.torch, self.dr
        eye, mvp = camera(yaw, pitch, fov)
        clip = torch.cat([self.v, torch.ones_like(self.v[:, :1])], 1) @ torch.tensor(mvp, dtype=torch.float32, device="cuda").T
        rast, _ = dr.rasterize(self.ctx, clip[None], self.f, (size, size))
        tc, _ = dr.interpolate(self.uv_tex[None], rast, self.f)
        colour = dr.texture(self.tex, tc, filter_mode="linear")[0].flip(0)
        pos, _ = dr.interpolate(self.v[None], rast, self.f)
        return {"eye": eye, "mvp": mvp, "mask": (rast[0, ..., 3] > 0).flip(0), "colour": colour, "pos": pos[0].flip(0)}


def photo_frame(mask, photo_alpha):
    # The similarity (one scale, then a shift) that lays the rendered silhouette's bounding box on the photo's.
    ys, xs = np.nonzero(mask)
    py, px = np.nonzero(photo_alpha > 128)
    s = 0.5 * ((px.max() - px.min()) / max(1, xs.max() - xs.min()) + (py.max() - py.min()) / max(1, ys.max() - ys.min()))
    rc = np.array([(xs.max() + xs.min()) / 2, (ys.max() + ys.min()) / 2])
    pc = np.array([(px.max() + px.min()) / 2, (py.max() + py.min()) / 2])
    return s, rc, pc


def fit_photo_pose(mesh, texture, photo_path, fovs=(15, 25, 35), size=192):
    # Finds the camera of the photo: the yaw, pitch and field of view whose render best matches the cutout, by
    # silhouette overlap (IoU) less half the mean colour difference inside it (a square puck's outline alone can't
    # tell its front from its side). A coarse 5-degree grid, then 1 degree round the best.
    photo = Image.open(photo_path).convert("RGBA")
    photo.thumbnail((size, size), Image.LANCZOS)
    rgba = np.asarray(photo, dtype=np.float32) / 255
    want = rgba[..., 3] > 0.5
    shots = Shots(mesh, texture)

    def score(yaw, pitch, fov):
        shot = shots.shoot(yaw, pitch, fov, size)
        mask = shot["mask"].cpu().numpy()
        if not mask.any():
            return -1.0
        s, rc, pc = photo_frame(mask, rgba[..., 3] * 255)
        # Pull the render into the photo's frame: each photo pixel looks up its render pixel.
        yy, xx = np.mgrid[0 : want.shape[0], 0 : want.shape[1]]
        rx = np.clip(np.round((xx - pc[0]) / s + rc[0]).astype(int), 0, size - 1)
        ry = np.clip(np.round((yy - pc[1]) / s + rc[1]).astype(int), 0, size - 1)
        got = mask[ry, rx]
        iou = (got & want).sum() / max(1, (got | want).sum())
        both = got & want
        colour = shot["colour"].cpu().numpy()[ry, rx]
        diff = np.abs(colour[both] - rgba[..., :3][both]).mean() if both.any() else 1.0
        return iou - 0.5 * diff

    best = max(((score(y, p, f), y, p, f) for f in fovs for y in range(-180, 180, 5) for p in range(0, 90, 5)))
    _, y0, p0, f0 = best
    best = max(((score(y, p, f0), y, p, f0) for y in range(y0 - 4, y0 + 5) for p in range(max(0, p0 - 4), min(89, p0 + 5))))
    return {"score": round(float(best[0]), 4), "yaw": best[1], "pitch": best[2], "fov": best[3]}


def texel_points(shots, texture):
    # Every texel's surface point and unit normal, by rasterising the mesh in texture space. Returns the texels the
    # mesh covers (rows top down, as in the image) and, for those in row order, their points and normals.
    torch, dr = shots.torch, shots.dr
    w, h = texture.size
    uv_clip = torch.cat([shots.uv * 2 - 1, torch.zeros_like(shots.uv[:, :1]), torch.ones_like(shots.uv[:, :1])], 1)
    rast, _ = dr.rasterize(shots.ctx, uv_clip[None], shots.f, (h, w))
    covered = (rast[0, ..., 3] > 0).flip(0)
    pos, _ = dr.interpolate(shots.v[None], rast, shots.f)
    nrm, _ = dr.interpolate(shots.n[None], rast, shots.f)
    return covered, pos[0].flip(0)[covered], torch.nn.functional.normalize(nrm[0].flip(0)[covered], dim=-1)


def project_photo(mesh, texture, photo_path, pose, size=1024):
    # Paints the photo back onto the faces it shows. TRELLIS bakes a softened copy of the photo into its texture and
    # garbles fine print (the Linktop's "LINKTOP" came out as "WIIIOG"), so the first frame of the model didn't match
    # the cutout it fades in from. With the photo's camera ({"yaw", "pitch", "fov"}, from --fit-pose), each texel
    # whose surface point is the first one hit from that camera takes the photo's colour, fully where the surface
    # faces the camera, fading out toward grazing angles and the cutout's soft edge. Texels the photo can't see keep
    # TRELLIS's colour.
    shots = Shots(mesh, texture)
    torch = shots.torch
    photo = np.asarray(Image.open(photo_path).convert("RGBA"), dtype=np.float32) / 255
    shot = shots.shoot(pose["yaw"], pose["pitch"], pose["fov"], size)
    s, rc, pc = photo_frame(shot["mask"].cpu().numpy(), photo[..., 3] * 255)
    covered, pos, nrm = texel_points(shots, texture)
    # Where each lands in the render, and whether it is the surface seen there.
    mvp = torch.tensor(shot["mvp"], dtype=torch.float32, device="cuda")
    clip = torch.cat([pos, torch.ones_like(pos[:, :1])], 1) @ mvp.T
    ndc = clip[:, :2] / clip[:, 3:]
    col = ((ndc[:, 0] + 1) / 2 * size).clamp(0, size - 1)
    row = ((1 - ndc[:, 1]) / 2 * size).clamp(0, size - 1)
    seen = shot["pos"][row.long(), col.long()]
    hit = shot["mask"][row.long(), col.long()] & ((seen - pos).norm(dim=-1) < 0.006)
    to_eye = torch.nn.functional.normalize(torch.tensor(shot["eye"], dtype=torch.float32, device="cuda") - pos, dim=-1)
    facing = (((nrm * to_eye).sum(-1) - 0.2) / 0.3).clamp(0, 1)
    # The photo pixel under each texel, sampled bilinearly.
    px = (col.cpu().numpy() - rc[0]) * s + pc[0]
    py = (row.cpu().numpy() - rc[1]) * s + pc[1]
    grid = torch.tensor(np.stack([px / (photo.shape[1] - 1) * 2 - 1, py / (photo.shape[0] - 1) * 2 - 1], -1), dtype=torch.float32, device="cuda")
    img = torch.tensor(photo, device="cuda").permute(2, 0, 1)[None]
    sample = torch.nn.functional.grid_sample(img, grid[None, None], align_corners=True, padding_mode="zeros")[0, :, 0].T
    weight = hit.float() * facing * sample[:, 3].clamp(0, 1) ** 4
    if pose.get("below_y") is not None:
        # Only below that height, fading out over the last 2% of the size.
        weight = weight * ((pose["below_y"] - pos[:, 1]) / 0.02).clamp(0, 1)
    if pose.get("min_up") is not None:
        # Only on faces turned up at least that far (the upward part of the normal), fading in over 0.15: the
        # Linktop's top face and the shoulder round it. Its side walls, which the photo sees steeply from 46 degrees
        # up, keep TRELLIS's colour: painted from the photo, the photo's bottom edge and the shadow under it landed
        # as a dark curved band across the front wall wherever the model's edge and the photo's part by a pixel.
        weight = weight * ((nrm[:, 1] - pose["min_up"]) / 0.15).clamp(0, 1)
    weight = weight[:, None]
    out = torch.tensor(np.asarray(texture.convert("RGB"), dtype=np.float32) / 255, device="cuda")
    out[covered] = out[covered] * (1 - weight) + sample[:, :3] * weight
    return Image.fromarray((out.clamp(0, 1).cpu().numpy() * 255 + 0.5).astype(np.uint8))


def text_mask(spec, width, height):
    # The lettering as a coverage mask of width x height pixels: drawn large in the table's font, each character
    # "tracking" (a share of the font size) apart and its strokes thickened by "stroke" (also a share of the size),
    # then cropped to the ink and resized to the box, which antialiases it.
    font = ImageFont.truetype(spec["font"], 400)
    if spec.get("variation"):
        font.set_variation_by_name(spec["variation"])
    advance = [font.getlength(ch) for ch in spec["text"]]
    canvas = Image.new("L", (int(sum(advance) + 400 * spec.get("tracking", 0) * len(advance) + 400), 800), 0)
    draw, x, stroke = ImageDraw.Draw(canvas), 200, round(400 * spec.get("stroke", 0))
    for ch, a in zip(spec["text"], advance):
        draw.text((x, 200), ch, font=font, fill=255, stroke_width=stroke, stroke_fill=255)
        x += a + 400 * spec.get("tracking", 0)
    ink = canvas.crop(canvas.getbbox()).resize((max(1, width), max(1, height)), Image.LANCZOS)
    return np.asarray(ink, dtype=np.float32) / 255


def bumper_text(mesh, texture, spec, res=1000):
    # Relabels the 2019 robot's bumpers. TRELLIS letters them in gibberish (white marks reading "IIII" or "DIO"), and
    # the photo painted back by "project" only covers what the photo sees, smeared where it meets a face at a grazing
    # angle (on this model the photo's lettering partly lands on the bumper's top edge). The real bumpers carry a white
    # "744" on every face (6.jpg shows two, Jiatuo's photo of the far side the other two). spec gives:
    # - "text", its white "rgb", the "font" file and its "variation", "tracking" and "stroke" (see text_mask);
    # - "band_y", the heights the bumper fabric spans, counted on over the top edge (see below), and "depth", how far
    #   in from a face the bumper reaches (the frame rail sits further in and is left alone);
    # - "fabric_rgb", the bumper's blue; a mark is anything greyer than "mark_sat" times its saturation and brighter
    #   than "mark_value" times its brightness;
    # - "faces": per face its outward "normal", its plane ("at", the distance from the centre along the normal) and
    #   the "box" for the text, [u0, y0, u1, y1] in the finished frame, with u running to the right as seen from
    #   outside the face.
    # A face's texels are unrolled into a flat face image, res pixels per unit, so a letter that crosses an atlas seam
    # is drawn once. There every mark is painted out with the blue beside it, with the fabric's fine shading copied
    # from clean fabric nearby so the fill isn't flat, and the text is drawn in its box, its white shaded by the
    # brightness of the blue under it (folds and the shadowed side stay). The face image is sampled back at each
    # texel only where something changed, and the atlas gutters along the bumper's charts take their neighbours'
    # colour (TRELLIS padded them with whatever its bake had there, pale marks included), so no white line shows
    # along a seam when the texture is filtered.
    from scipy.ndimage import binary_dilation, distance_transform_edt, gaussian_filter, map_coordinates

    if not spec:
        return texture
    shots = Shots(mesh, texture)
    covered, pos, nrm = texel_points(shots, texture)
    covered, pos, nrm = covered.cpu().numpy(), pos.cpu().numpy().astype(float), nrm.cpu().numpy().astype(float)
    rows, cols = np.nonzero(covered)
    out = np.asarray(texture.convert("RGB"), dtype=np.float32).copy()
    texels = out[rows, cols]
    y_lo, y_hi = spec["band_y"]
    normals = np.asarray([f["normal"] for f in spec["faces"]], dtype=float)
    planes = np.asarray([f["at"] for f in spec["faces"]], dtype=float)
    # Each texel belongs to the face whose plane it is nearest (the footprint splits along its diagonals), and is
    # unrolled over the bumper's top: on the upward-facing roll, height goes on growing by the depth in from the face,
    # so a mark painted on the top edge lands above the face in the face image rather than on top of the face's own
    # texels.
    depth = planes[None] - pos @ normals.T
    owner = depth.argmin(1)
    up = np.clip((nrm[:, 1] - 0.3) / 0.4, 0, 1)
    fabric = np.asarray(spec["fabric_rgb"], dtype=float)
    fabric_sat = (fabric.max() - fabric.min()) / fabric.max()
    changed, bumper = np.zeros(len(pos), bool), np.zeros(len(pos), bool)
    for i, face in enumerate(spec["faces"]):
        d = normals[i]
        right = np.cross(-d, [0, 1, 0])
        out_facing = (nrm @ d > 0.1) | ((up > 0) & (nrm @ d > -0.2))
        sel = (owner == i) & out_facing & (depth[:, i] < spec.get("depth", 0.065)) & (pos[:, 1] >= y_lo)
        y = pos[:, 1] + up * np.maximum(0, depth[:, i] - 0.01)
        sel &= y <= y_hi
        u, y = pos[sel] @ right, y[sel]
        u_lo = u.min()
        fw, fh = int((u.max() - u_lo) * res) + 2, int((y_hi - y_lo) * res) + 2
        fx, fy = (u - u_lo) * res, (y_hi - y) * res
        # TRELLIS leaves inner layers behind the fabric (the shell's far wall, the gap under the frame) that unroll
        # onto the same spots, so only the outermost surface, within 8 mm of the least depth in its 4 mm cell, makes
        # the face image; the layers behind it are invisible and just take its colour.
        dep = depth[sel, i]
        cell = (np.floor(fy / (0.004 * res)).astype(int), np.floor(fx / (0.004 * res)).astype(int))
        least = np.full((cell[0].max() + 1, cell[1].max() + 1), np.inf)
        np.minimum.at(least, cell, dep)
        outer = dep <= least[cell] + 0.008
        acc, count = np.zeros((fh, fw, 3)), np.zeros((fh, fw))
        ix, iy = np.round(fx).astype(int), np.round(fy).astype(int)
        np.add.at(acc, (iy[outer], ix[outer]), texels[sel][outer])
        np.add.at(count, (iy[outer], ix[outer]), 1)
        img = acc / np.maximum(count, 1)[..., None]
        _, (ny, nx) = distance_transform_edt(count == 0, return_indices=True)
        img = img[ny, nx]
        # The marks: paler than the fabric and well below its saturation. Dark parts (the gap under the frame, the
        # underside) aren't marks.
        hi, lo = img.max(2), img.min(2)
        sat = (hi - lo) / np.maximum(hi, 1)
        marks = (sat < spec.get("mark_sat", 0.6) * fabric_sat) & (hi > spec.get("mark_value", 0.6) * fabric.max())
        # TRELLIS outlines its marks in dark blue; the outline goes with the mark, except along the bumper's
        # underside (its bottom centimetre), which is dark anyway.
        dark = hi < 0.45 * fabric.max()
        rows_v = y_hi - np.arange(fh)[:, None] / res
        marks = binary_dilation(marks, iterations=3)
        marks |= dark & binary_dilation(marks, iterations=4) & (rows_v > y_lo + 0.012)
        # The fill is the clean fabric's colour at the same height: TRELLIS baked the bumper light along the top and
        # dark navy below, so it is a weighted mean of the unmarked fabric along the row (a few millimetres up and
        # down, up to about 6 cm along), then round about within 2.4 cm where the row has none, then the table's
        # fabric colour. Dark parts (the gap under the frame, the underside) don't count and stay as they are.
        dark = binary_dilation(dark, iterations=2) & ~marks
        source = (~(marks | dark)).astype(np.float32)
        fill = np.broadcast_to(fabric, img.shape).copy()
        for sigma, enough in ((24, 0.01), ((3, 60), 0.05), ((2, 16), 0.2)):
            weight = gaussian_filter(source, sigma)
            mean = np.stack([gaussian_filter(img[..., c] * source, sigma) for c in range(3)], -1) / np.maximum(weight, 1e-6)[..., None]
            fill = np.where((weight > enough)[..., None], mean, fill)
        fill = np.where(source[..., None] > 0, img, fill).astype(np.float32)
        # Fine shading (the fabric's weave and creases) for the filled marks, from clean fabric a letter's width along.
        lum = img.mean(2)
        fine = np.clip(lum - gaussian_filter(lum, 3), -10, 10)
        source = ~binary_dilation(marks | dark, iterations=3)
        detail, need = np.zeros_like(lum), marks.copy()
        for shift in (int(0.12 * res), -int(0.12 * res), int(0.24 * res), -int(0.24 * res)):
            ok = need & np.roll(source, shift, axis=1)
            detail[ok] = np.roll(fine, shift, axis=1)[ok]
            need &= ~ok
        smooth = np.maximum(fill.mean(2), 1)
        fill = np.where(marks[..., None], fill * (1 + detail / smooth)[..., None], fill)
        # The text, its white shaded like the fabric under it.
        u0, y0, u1, y1 = face["box"]
        c0, r0 = int(round((u0 - u_lo) * res)), int(round((y_hi - y1) * res))
        ink = np.zeros((fh, fw), np.float32)
        mask = text_mask(spec, int(round((u1 - u0) * res)), int(round((y1 - y0) * res)))
        r1, c1 = min(fh, r0 + mask.shape[0]), min(fw, c0 + mask.shape[1])
        ink[max(0, r0) : r1, max(0, c0) : c1] = mask[max(0, -r0) : r1 - r0, max(0, -c0) : c1 - c0]
        clean = (sat > 0.8 * fabric_sat) & ~marks & ~dark
        ref = np.median(fill.mean(2)[clean]) if clean.any() else fabric.mean()
        shade = np.clip(fill.mean(2) / ref, 0.8, 1.05) ** 0.5
        white = np.asarray(spec["rgb"], dtype=np.float32)[None, None] * shade[..., None]
        new = fill * (1 - ink[..., None]) + white * ink[..., None]
        alpha = np.clip(np.maximum(gaussian_filter(marks.astype(np.float32), 1.0) * 1.5, ink), 0, 1)
        # Back onto the texels of this face.
        a = map_coordinates(alpha, [fy, fx], order=1, mode="nearest")
        got = np.stack([map_coordinates(new[..., c], [fy, fx], order=1, mode="nearest") for c in range(3)], 1)
        texels[sel] = texels[sel] * (1 - a[:, None]) + got * a[:, None]
        changed[np.nonzero(sel)[0][a > 0.01]] = True
        bumper |= sel
        print(f"bumper_text: face {face['normal']}: {int(sel.sum())} texels, {int((a > 0.01).sum())} changed", file=sys.stderr)
    out[rows, cols] = texels
    # Gutters: texels outside every chart within 4 pixels of a bumper texel take the nearest chart texel's colour.
    hit = np.zeros(covered.shape, bool)
    hit[rows[bumper], cols[bumper]] = True
    gutter = binary_dilation(hit, iterations=4) & ~covered
    _, (ny, nx) = distance_transform_edt(~covered, return_indices=True)
    out[gutter] = out[ny[gutter], nx[gutter]]
    return Image.fromarray(np.clip(out + 0.5, 0, 255).astype(np.uint8))


def seen_texels(mesh, texture, pos, pose, size=1024):
    # Which of the surface points pos (texel_points' order) the camera pose ({"yaw", "pitch", "fov"}) sees: the first
    # surface its ray meets, as in project_photo.
    import torch

    shots = Shots(mesh, texture)
    shot = shots.shoot(pose["yaw"], pose["pitch"], pose["fov"], size)
    p = torch.tensor(pos, dtype=torch.float32, device="cuda")
    clip = torch.cat([p, torch.ones_like(p[:, :1])], 1) @ torch.tensor(shot["mvp"], dtype=torch.float32, device="cuda").T
    ndc = clip[:, :2] / clip[:, 3:]
    col = ((ndc[:, 0] + 1) / 2 * size).clamp(0, size - 1).long()
    row = ((1 - ndc[:, 1]) / 2 * size).clamp(0, size - 1).long()
    hit = shot["mask"][row, col] & ((shot["pos"][row, col] - p).norm(dim=-1) < 0.006)
    return hit.cpu().numpy()


def repaint(mesh, texture, entries):
    # Repaints spots the earlier steps leave wrong, texel by texel, after "project" and "bumper_text". Each entry has
    # a "box" [x0, y0, z0, x1, y1, z1] in the finished frame and picks the texels whose surface point lies in it and
    # whose colour passes its tests: "hue" [from, to] in degrees with "min_sat" (0-1), "max_sat", and "min_value" /
    # "max_value" (0-255, the brightest channel); with "unseen" (a "project" camera) only those that camera can't see.
    # With "rgb" [r, g, b] they take that colour; without, the colour of the texels
    # round them in the atlas that weren't picked (a normalised blur, widening until it finds some), so a stray mark
    # takes the panel's own colour. On the 2019 robot: a strip of the photo's green roller that "project" laid on the
    # far sponsor panel (the photo's roller and the model's are a few millimetres apart, and with the mirrored copy cut
    # away the panel behind showed through), and the dark gap TRELLIS left between the bumpers and the frame, a black
    # line along the top of the bumpers where the photo shows the frame's aluminium rail.
    from scipy.ndimage import binary_dilation, gaussian_filter

    if not entries:
        return texture
    covered, pos, _ = texel_points(Shots(mesh, texture), texture)
    covered, pos = covered.cpu().numpy(), pos.cpu().numpy().astype(float)
    rows, cols = np.nonzero(covered)
    out = np.asarray(texture.convert("RGB"), dtype=np.float32).copy()
    for entry in entries:
        texels = out[rows, cols]
        b = np.asarray(entry["box"], dtype=float)
        pick = np.all((pos >= b[:3]) & (pos <= b[3:]), axis=1)
        hi, lo = texels.max(1), texels.min(1)
        if "hue" in entry:
            hsv = np.asarray(Image.fromarray(texels[None].astype(np.uint8)).convert("HSV"))[0].astype(float)
            hue = hsv[:, 0] * 360 / 255
            h0, h1 = entry["hue"]
            pick &= (hue >= h0) & (hue < h1) & ((hi - lo) / np.maximum(hi, 1) >= entry.get("min_sat", 0))
        pick &= (hi >= entry.get("min_value", 0)) & (hi <= entry.get("max_value", 255))
        pick &= (hi - lo) / np.maximum(hi, 1) <= entry.get("max_sat", 1)
        if entry.get("unseen"):
            # Only texels the photo's camera ({"yaw", "pitch", "fov"}) does not see, so the first frame keeps the photo.
            pick &= ~seen_texels(mesh, texture, pos, entry["unseen"])
        mask = np.zeros(covered.shape, bool)
        mask[rows[pick], cols[pick]] = True
        # One texel round each picked one too, for the soft edge the texture filter gives a mark.
        mask = binary_dilation(mask, iterations=1) & covered
        if entry.get("rgb") is not None:
            out[mask] = np.asarray(entry["rgb"], dtype=np.float32)
        else:
            source = (covered & ~mask).astype(np.float32)
            fill = np.zeros_like(out)
            need = mask.copy()
            for sigma in (2, 4, 8, 16, 32, 64):
                weight = gaussian_filter(source, sigma)
                mean = np.stack([gaussian_filter(out[..., c] * source, sigma) for c in range(3)], -1) / np.maximum(weight, 1e-6)[..., None]
                ok = need & (weight > 0.05)
                fill[ok] = mean[ok]
                need &= ~ok
            out[mask] = fill[mask]
        print(f"repaint: box {entry['box']}: {int(mask.sum())} texels", file=sys.stderr)
    return Image.fromarray(np.clip(out + 0.5, 0, 255).astype(np.uint8))


def mirror_copy(mesh, texture, spec):
    # Fills the 2019 robot's far bay. TRELLIS mirrored the photographed intake onto the far side, and once that copy is
    # cut away (remove_boxes) the bay floor there is a bare slab: Jiatuo's photo of that side shows it crowded with
    # wiring, motors and controllers like the near side's. So the near bay floor, which the photo paints with its
    # wiring, is copied across, mirrored in the plane x = "x" (faces whose centres lie in "box"; ones in "skip_sphere"
    # [x, y, z, r], the ball's foot, and ones whose texel is in a "skip_hue" band [from, to] of saturated colour, the
    # green rollers, stay behind). The copy shares the original's texels (same UVs), so it is made last, after every
    # texture step has used the mesh to place its texels.
    import trimesh

    if not spec:
        return mesh
    b = np.asarray(spec["box"], dtype=float)
    centres = mesh.triangles_center
    pick = np.all((centres >= b[:3]) & (centres <= b[3:]), axis=1)
    if spec.get("skip_sphere"):
        s = np.asarray(spec["skip_sphere"], dtype=float)
        pick &= np.linalg.norm(centres - s[:3], axis=1) > s[3]
    if spec.get("skip_hue"):
        img = np.asarray(texture.convert("HSV"))
        w, h = texture.size
        uv = mesh.visual.uv[mesh.faces].mean(1)
        px = np.clip((uv[:, 0] * w).astype(int), 0, w - 1)
        py = np.clip(((1 - uv[:, 1]) * h).astype(int), 0, h - 1)
        hsv = img[py, px].astype(float)
        hue = hsv[:, 0] * 360 / 255
        for h0, h1 in spec["skip_hue"]:
            pick &= ~((hue >= h0) & (hue < h1) & (hsv[:, 1] > 100))
    faces = mesh.faces[pick]
    used = np.unique(faces)
    remap = np.full(len(mesh.vertices), -1)
    remap[used] = np.arange(len(used)) + len(mesh.vertices)
    copy = mesh.vertices[used].copy()
    copy[:, 0] = 2 * spec["x"] - copy[:, 0]
    # Mirroring turns the winding inside out; swapping two corners turns it back.
    new_faces = remap[faces][:, [0, 2, 1]]
    uv = np.vstack([mesh.visual.uv, mesh.visual.uv[used]])
    visual = trimesh.visual.TextureVisuals(uv=uv, image=texture)
    out = trimesh.Trimesh(np.vstack([mesh.vertices, copy]), np.vstack([mesh.faces, new_faces]), visual=visual, process=False)
    print(f"mirror_copy: {len(new_faces)} faces copied across x = {spec['x']}", file=sys.stderr)
    return out


def pad_gutters(mesh, texture):
    # TRELLIS leaves the atlas between its charts unpadded, so where a chart edge runs through a face (the robot's
    # sponsor panels) texture filtering and mipmaps pull that colour in as a thin dark line along the seam. Every
    # texel outside the charts takes the colour of the nearest one inside. A patch from add_patches has no chart (all
    # its vertices map to the middle of its swatch), so the texels round the UV point of every face with no area in
    # the atlas count as inside too, and a swatch keeps its colour.
    from scipy.ndimage import binary_dilation, distance_transform_edt

    w, h = texture.size
    covered = texel_points(Shots(mesh, texture), texture)[0].cpu().numpy()
    points = np.zeros_like(covered)
    tri = np.asarray(mesh.visual.uv)[mesh.faces]
    area = np.abs(np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]))
    uv = tri[area * w * h < 0.01].reshape(-1, 2)
    points[np.clip(((1 - uv[:, 1]) * h).astype(int), 0, h - 1), np.clip((uv[:, 0] * w).astype(int), 0, w - 1)] = True
    covered |= binary_dilation(points, iterations=3)
    _, (ny, nx) = distance_transform_edt(~covered, return_indices=True)
    return Image.fromarray(np.asarray(texture.convert("RGB"))[ny, nx])


def finish(mesh, cfg, art_id, seed, out_path):
    # TRELLIS hands back a +Y-up mesh in a unit cube. The table's rotate_deg (x, y, z, applied in that order) turns it
    # so the side the photo shows faces +Z. Then it is centred and scaled so its longest side is 1; size_m keeps the
    # real length for the viewer. glTF's default metallic factor is 1, which renders a photo texture as dark chrome,
    # so the material is set to plain dielectric.
    import trimesh

    rx, ry, rz = (math.radians(a) for a in cfg["rotate_deg"])
    mesh.apply_transform(trimesh.transformations.euler_matrix(rx, ry, rz, "sxyz"))
    lo, hi = mesh.bounds
    mesh.apply_translation(-(lo + hi) / 2)
    mesh.apply_scale(1.0 / float(np.max(hi - lo)))
    if cfg.get("true_extents_m"):
        # From one photo TRELLIS has to guess the depth, and from a photo taken from above it guesses long: the
        # Linktop, a 70 x 70 x 18.4 mm square puck, came out as an oval about 1.4 times as deep as wide. When the
        # real dimensions are known, [x, y, z] in metres, each axis is scaled to them.
        want = np.asarray(cfg["true_extents_m"], dtype=float)
        mesh.apply_scale(want / float(want.max()) / mesh.extents)
        lo, hi = mesh.bounds
        mesh.apply_translation(-(lo + hi) / 2)
    if cfg.get("flatten_top"):
        # TRELLIS read the Linktop's flush sensor window as a dimple, and a photo painted on a dimple from 46 degrees
        # up stretches the window to an oval when seen from above. flatten_top, a fraction, levels the top face: the
        # vertices in the upper half that lie that far inside the footprint's edges are set to the face's median
        # height. The rounded edge outside that band keeps its shape.
        inset = float(cfg["flatten_top"])
        lo, hi = mesh.bounds
        v = mesh.vertices.copy()
        span = hi - lo
        inner = np.all(np.abs(v[:, [0, 2]] - (lo + hi)[[0, 2]] / 2) < span[[0, 2]] * (0.5 - inset), axis=1)
        top = inner & (v[:, 1] > (lo[1] + hi[1]) / 2)
        v[top, 1] = np.median(v[top, 1])
        mesh.vertices = v
    if cfg.get("square_off"):
        mesh = square_off(mesh, cfg["square_off"])
    mesh = remove_boxes(mesh, cfg.get("remove_boxes"), cfg.get("debris", 200))
    texture = fix_hues(mesh.visual.material.baseColorTexture, cfg.get("hue_fix"))
    mesh, texture = add_patches(mesh, texture, cfg.get("patches"))
    project = cfg.get("project")
    for pose in [project] if isinstance(project, dict) else project or []:
        texture = project_photo(mesh, texture, source_path(cfg), pose)
    texture = bumper_text(mesh, texture, cfg.get("bumper_text"))
    texture = repaint(mesh, texture, cfg.get("repaint"))
    if cfg.get("pad_gutters"):
        texture = pad_gutters(mesh, texture)
    mesh = mirror_copy(mesh, texture, cfg.get("mirror_copy"))
    extents = mesh.extents * cfg["size_m"]
    meta = {
        "journey": {
            "id": art_id,
            "size_m": cfg["size_m"],
            "extents_m": [round(float(e), 4) for e in extents],
            "generator": GENERATOR,
            "seed": seed,
            "sources": cfg["sources"],
        }
    }
    quality, side = cfg["jpeg_quality"], texture.width
    while True:
        tex = texture if side == texture.width else texture.resize((side, side), Image.LANCZOS)
        material = trimesh.visual.material.PBRMaterial(
            baseColorTexture=jpeg(tex, quality),
            baseColorFactor=[255, 255, 255, 255],
            metallicFactor=0.0,
            roughnessFactor=0.85,
            doubleSided=True,
        )
        mesh.visual = trimesh.visual.TextureVisuals(uv=mesh.visual.uv, material=material)
        scene = trimesh.Scene(mesh)
        scene.metadata.update(meta)
        data = scene.export(file_type="glb", include_normals=True)
        if len(data) <= cfg["max_bytes"] or (quality <= 70 and side <= 512):
            break
        if quality > 70:
            quality -= 8
        else:
            quality, side = cfg["jpeg_quality"], side // 2
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(data)
    return {
        "file": str(out_path),
        "bytes": len(data),
        "triangles": int(len(mesh.faces)),
        "texture": side,
        "jpeg_quality": quality,
        "extents_m": meta["journey"]["extents_m"],
    }


# ---------------------------------------------------------------------------------------------------- imported models

# An artifact whose table entry has an "import" block is built from an existing glTF binary (a manufacturer's own
# product model) instead of TRELLIS; see import_model() and the comment at the top. glTF's component types and widths,
# for reading plain (not Draco-compressed) accessors:
GL_TYPES = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
GL_WIDTH = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}


def fetch_import(spec, art_id, source=None):
    # The source file: from the cache, $J/downloads/<id>/<file name>, fetched from spec["url"] the first time (or copied
    # from --source, a copy downloaded by hand). Either way it must match spec["sha256"], so a file changed upstream is
    # looked at before anything is built from it. Nothing in it is run: it is read as data.
    import hashlib, urllib.parse, urllib.request

    cache = TOOLS / "downloads" / art_id / Path(urllib.parse.urlparse(spec["url"]).path).name
    if source:
        data = Path(source).read_bytes()
    elif cache.exists():
        data = cache.read_bytes()
    else:
        request = urllib.request.Request(spec["url"], headers={"User-Agent": "Mozilla/5.0 (jiatuoz2.github.io model build)"})
        with urllib.request.urlopen(request, timeout=120) as response:
            data = response.read()
    digest = hashlib.sha256(data).hexdigest()
    if digest != spec["sha256"]:
        sys.exit(f"{spec['url']}: sha256 {digest}, not the {spec['sha256']} in {TABLE.name}; look at the new file before using it")
    if not cache.exists():
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_bytes(data)
    return data, cache


def read_glb(data):
    import struct

    magic, version, length = struct.unpack_from("<III", data, 0)
    if magic != 0x46546C67 or version != 2:
        sys.exit("not a glTF 2.0 binary")
    gltf, binary, at = None, b"", 12
    while at < length:
        size, kind = struct.unpack_from("<I4s", data, at)
        chunk = data[at + 8 : at + 8 + size]
        if kind == b"JSON":
            gltf = json.loads(chunk)
        elif kind == b"BIN\x00":
            binary = chunk
        at += 8 + size
    return gltf, binary


def node_matrix(node):
    if "matrix" in node:
        return np.asarray(node["matrix"], dtype=float).reshape(4, 4).T
    x, y, z, w = node.get("rotation", [0, 0, 0, 1])
    rotation = np.array(
        [
            [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
            [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
            [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
        ]
    )
    m = np.eye(4)
    m[:3, :3] = rotation * np.asarray(node.get("scale", [1, 1, 1]), dtype=float)
    m[:3, 3] = node.get("translation", [0, 0, 0])
    return m


def read_accessor(gltf, binary, index):
    acc = gltf["accessors"][index]
    view = gltf["bufferViews"][acc["bufferView"]]
    dtype = np.dtype(GL_TYPES[acc["componentType"]])
    width = GL_WIDTH[acc["type"]]
    stride = view.get("byteStride") or dtype.itemsize * width
    offset = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
    data = np.array(np.ndarray((acc["count"], width), dtype, buffer=binary, offset=offset, strides=(stride, dtype.itemsize)))
    if acc.get("normalized"):
        data = np.maximum(data / float(np.iinfo(dtype).max), -1.0)
    return data


def import_parts(gltf, binary, variant=None):
    # Every triangle primitive of the scene as a part in the scene's frame (node transforms applied): positions,
    # normals, first UV set, triangles and material. With a variant (KHR_materials_variants), its materials are baked
    # in. Draco-compressed primitives (KHR_draco_mesh_compression) are decoded with DracoPy.
    import DracoPy

    names = [v["name"] for v in gltf.get("extensions", {}).get("KHR_materials_variants", {}).get("variants", [])]
    chosen = names.index(variant) if variant else None
    parts = []

    def walk(index, parent):
        node = gltf["nodes"][index]
        world = parent @ node_matrix(node)
        for prim in gltf["meshes"][node["mesh"]]["primitives"] if "mesh" in node else []:
            if prim.get("mode", 4) != 4:
                sys.exit(f"{node.get('name')}: only triangle lists are handled")
            draco = prim.get("extensions", {}).get("KHR_draco_mesh_compression")
            if draco:
                view = gltf["bufferViews"][draco["bufferView"]]
                start = view.get("byteOffset", 0)
                mesh = DracoPy.decode(binary[start : start + view["byteLength"]])
                faces = np.asarray(mesh.faces, dtype=np.int64).reshape(-1, 3)

                def attribute(name):
                    if name not in draco["attributes"]:
                        return None
                    return np.asarray(mesh.get_attribute_by_unique_id(draco["attributes"][name])["data"], dtype=float)

            else:
                faces = read_accessor(gltf, binary, prim["indices"]).astype(np.int64).reshape(-1, 3)

                def attribute(name):
                    return read_accessor(gltf, binary, prim["attributes"][name]).astype(float) if name in prim["attributes"] else None

            material = prim.get("material")
            for mapping in prim.get("extensions", {}).get("KHR_materials_variants", {}).get("mappings", []):
                if chosen in mapping["variants"]:
                    material = mapping["material"]
            linear = world[:3, :3]
            normals = attribute("NORMAL")
            if normals is not None:
                normals = normals @ np.linalg.inv(linear)
                normals /= np.maximum(np.linalg.norm(normals, axis=1, keepdims=True), 1e-12)
            parts.append(
                {
                    "name": node.get("name", f"node {index}"),
                    "positions": attribute("POSITION") @ linear.T + world[:3, 3],
                    "normals": normals,
                    "uv": attribute("TEXCOORD_0"),
                    "faces": faces,
                    "material": material,
                }
            )
        for child in node.get("children", []):
            walk(child, world)

    for index in gltf["scenes"][gltf.get("scene", 0)]["nodes"]:
        walk(index, np.eye(4))
    return parts


def mesh_pieces(positions, faces):
    # The connected pieces of a mesh, joining vertices that share a position (UV seams split them in the file).
    from scipy.sparse import coo_matrix
    from scipy.sparse.csgraph import connected_components

    _, weld = np.unique(np.round(positions * 1e7).astype(np.int64), axis=0, return_inverse=True)
    weld = weld.ravel()
    tri = weld[faces]
    edges = np.r_[tri[:, [0, 1]], tri[:, [1, 2]]]
    n = int(weld.max()) + 1
    _, label = connected_components(coo_matrix((np.ones(len(edges)), (edges[:, 0], edges[:, 1])), shape=(n, n)), directed=False)
    return label[weld]


def _smoothstep(x):
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3 - 2 * x)


class Strap:
    # One strap of a watch band modelled closed round a wrist, in the plane of the loop: the band's frame with the case
    # face toward +Z, 12 o'clock +Y, crown +X, so the loop lies in the YZ plane and X is across the strap. Coordinates
    # here are mm, mirrored for the strap at 6 o'clock (side -1) so that every strap leaves its lug toward +Y and turns
    # clockwise round the loop's centre. Its centreline is fitted as a curve in that plane (the middle of the strap's
    # thickness, angle by angle round the loop's centre, smoothed), and each vertex is held by where it lies along it:
    # s, its arc length from the lug; d, its offset along the outward normal (toward the outer face); e, what is left
    # along the tangent (zero but at the lug, whose connector reaches back into the case).
    def __init__(self, points, centre, side, body_mid_z):
        p = points * 1000.0
        self.side = side
        self.local = np.c_[p[:, 0], p[:, 1] * side, p[:, 2]]
        cy, cz = centre[0] * 1000.0 * side, centre[1] * 1000.0
        theta = np.degrees(np.arctan2(self.local[:, 2] - cz, self.local[:, 1] - cy))
        # The lug: the part of the strap level with the case.
        root = theta[self.local[:, 2] > body_mid_z * 1000.0]
        start = math.degrees(math.atan2(np.sin(np.radians(root)).mean(), np.cos(np.radians(root)).mean()))
        t = (start - theta + 30.0) % 360.0 - 30.0
        lo_t, hi_t = math.floor(t.min()), math.ceil(t.max())
        radius = np.hypot(self.local[:, 1] - cy, self.local[:, 2] - cz)
        edges = np.arange(lo_t, hi_t + 1.0)
        mids, inner, outer, count = [], [], [], []
        for a in edges[:-1]:
            r = radius[(t >= a) & (t < a + 1)]
            mids.append(a + 0.5)
            count.append(len(r))
            inner.append(np.percentile(r, 1) if len(r) else np.nan)
            outer.append(np.percentile(r, 99) if len(r) else np.nan)
        mids, inner, outer, count = map(np.asarray, (mids, inner, outer, count))
        thick = outer - inner
        typical = np.nanmedian(thick[count >= 6])
        good = (count >= 6) & (thick > 0.6 * typical)
        from scipy.ndimage import gaussian_filter1d

        mid_r = np.interp(mids, mids[good], ((inner + outer) / 2)[good])
        mid_r = gaussian_filter1d(mid_r, 2.0, mode="nearest")
        self.thickness = float(typical)
        td = np.arange(lo_t, hi_t + 0.05, 0.05)
        rd = np.interp(td, mids, mid_r)
        ang = np.radians(start - td)
        self.curve = np.c_[cy + rd * np.cos(ang), cz + rd * np.sin(ang)]
        step = np.r_[0.0, np.cumsum(np.linalg.norm(np.diff(self.curve, axis=0), axis=1))]
        root_at = step[np.searchsorted(td, 0.0)]
        self.s = step - root_at  # arc length from the lug (t = 0)
        tangent = np.gradient(self.curve, self.s, axis=0)
        self.tangent = tangent / np.linalg.norm(tangent, axis=1, keepdims=True)
        self.normal = np.c_[-self.tangent[:, 1], self.tangent[:, 0]]
        self.phi = np.unwrap(np.arctan2(self.tangent[:, 1], self.tangent[:, 0]))
        self.vs, self.vd, self.ve = self.project(self.local[:, 1:])
        self.length = float(self.vs.max())

    def project(self, yz):
        from scipy.spatial import cKDTree

        nearest = cKDTree(self.curve).query(yz)[1]
        rel = yz - self.curve[nearest]
        return self.s[nearest], (rel * self.normal[nearest]).sum(1), (rel * self.tangent[nearest]).sum(1)

    def layout(self, root, bend, touch, droop, remap):
        # The strap laid out flat: up to root (mm from the lug) it stays as it is, fixed to the case. From there its
        # centreline turns, over bend mm, from the way it leaves the lug to a gentle slope of droop radians (negative:
        # down), then levels out by touch mm from the lug and lies straight beyond. remap, [[from, to, factor], ...]
        # in mm along the strap, shortens or lengthens plain stretches (factor below or above 1), so the strap's
        # length is the photo's; the holes, slots and pin lie outside them and keep their size.
        s = self.s
        rate = np.ones_like(s)
        for a, b, factor in remap or []:
            rate[(s >= a) & (s < b)] = factor
        rate[s <= root] = 1.0
        mapped = np.r_[0.0, np.cumsum(0.5 * (rate[1:] + rate[:-1]) * np.diff(s))]
        mapped += s[0] - mapped[0]
        mapped = np.where(s <= root, s, mapped - np.interp(root, s, mapped) + root)
        at = np.searchsorted(s, root)
        phi0 = self.phi[at]
        u = mapped - root
        phi = np.where(
            u < bend,
            phi0 + (droop - phi0) * _smoothstep(u / bend),
            droop * (1 - _smoothstep((u - bend) / max(touch - root - bend, 1e-6))),
        )
        phi = np.where(u <= 0, self.phi, phi)
        direction = np.c_[np.cos(phi), np.sin(phi)]
        laid = self.curve.copy()
        du = np.diff(mapped)[at:]
        laid[at + 1 :] = self.curve[at] + np.cumsum(0.5 * (direction[at + 1 :] + direction[at:-1]) * du[:, None], axis=0)
        return mapped, laid, phi

    def place(self, layout, yz=None, s=None, d=None, e=None):
        # Where points (by default the strap's own vertices) go in a layout, and the turn of their normals there.
        mapped, laid, phi = layout
        if yz is not None:
            s, d, e = self.project(yz)
        elif s is None:
            s, d, e = self.vs, self.vd, self.ve
        m = np.interp(s, self.s, mapped)
        p = np.c_[np.interp(m, mapped, laid[:, 0]), np.interp(m, mapped, laid[:, 1])]
        turn = np.interp(m, mapped, phi)
        t = np.c_[np.cos(turn), np.sin(turn)]
        n = np.c_[-t[:, 1], t[:, 0]]
        return p + d[:, None] * n + e[:, None] * t, turn - np.interp(s, self.s, self.phi)


def _turn_yz(vectors, angle):
    c, s = np.cos(angle), np.sin(angle)
    y, z = vectors[:, 0], vectors[:, 1]
    return np.c_[c * y - s * z, s * y + c * z]


def lay_band_flat(band, post, spec, axis, body_hi):
    # The band as Google modelled it is closed in a loop, as worn. This lays it out flat and open, as it lies in the
    # photo: each strap (a connected piece of the band) is unbent from the loop into a straight strap leaving the case
    # at 12 or 6 o'clock (Strap.layout), its vertices placed by their arc length and offset from its centreline, their
    # normals turned with it. The pin (post) goes with its strap as one rigid piece, so it is not bent. The loop's
    # centre is a circle fitted to the whole band. The table is the case's back: the straps droop to it, and the
    # lowest point of each strap beyond its bend (the pin's foot, on the pin strap) rests on it.
    pos = band["positions"]
    label = mesh_pieces(pos, band["faces"])
    y, z = pos[:, 1], pos[:, 2]
    fit = np.linalg.lstsq(np.c_[2 * y, 2 * z, np.ones_like(y)], y * y + z * z, rcond=None)[0]
    centre = fit[:2]
    mid_z = (axis[2] + body_hi[2]) / 2
    table = axis[2] * 1000.0
    new_pos, new_nrm = pos.copy(), band["normals"].copy()
    along = np.zeros(len(pos))
    pieces = [k for k in np.unique(label) if (label == k).sum() > 50]
    report = []
    for k in pieces:
        idx = np.nonzero(label == k)[0]
        side = 1 if pos[idx][pos[idx, 2] > mid_z, 1].mean() > 0 else -1
        strap = Strap(pos[idx], centre, side, mid_z)
        key = "12" if side > 0 else "6"
        cfg = spec["straps"][key]
        carries_post = post is not None and key == str(spec.get("post_strap"))
        extra = None
        if carries_post:
            pl = post["positions"] * 1000.0
            extra = np.c_[pl[:, 1] * side, pl[:, 2]]

        def lowest(droop):
            lay = strap.layout(spec["root_mm"], spec["bend_mm"], spec["touch_mm"], droop, cfg.get("remap"))
            yz, _ = strap.place(lay)
            beyond = strap.vs > spec["root_mm"] + spec["bend_mm"]
            low = yz[beyond, 1].min()
            if extra is not None:
                low = min(low, rigid(lay, extra)[0][:, 1].min())
            return low, lay

        def rigid(lay, yz):
            # The post: moved and turned as the strap is where its middle lies.
            middle = yz.mean(0, keepdims=True)
            moved, turn = strap.place(lay, yz=middle)
            return moved + _turn_yz(yz - middle, turn[0]), turn[0]

        lo_d, hi_d = math.radians(-25), math.radians(8)
        for _ in range(40):
            droop = (lo_d + hi_d) / 2
            if lowest(droop)[0] < table:
                lo_d = droop
            else:
                hi_d = droop
        _, lay = lowest(hi_d)
        yz, turn = strap.place(lay)
        along[idx] = strap.vs
        new_pos[idx, 1] = yz[:, 0] * side / 1000.0
        new_pos[idx, 2] = yz[:, 1] / 1000.0
        n = band["normals"][idx]
        n_yz = _turn_yz(np.c_[n[:, 1] * side, n[:, 2]], turn)
        new_nrm[idx, 1], new_nrm[idx, 2] = n_yz[:, 0] * side, n_yz[:, 1]
        if carries_post:
            moved, angle = rigid(lay, extra)
            post["positions"] = np.c_[post["positions"][:, 0], moved[:, 0] * side / 1000.0, moved[:, 1] / 1000.0]
            pn = post["normals"]
            pn_yz = _turn_yz(np.c_[pn[:, 1] * side, pn[:, 2]], np.full(len(pn), angle))
            post["normals"] = np.c_[pn[:, 0], pn_yz[:, 0] * side, pn_yz[:, 1]]
        mapped = lay[0]
        report.append(
            {
                "lug": key,
                "pin": carries_post,
                "length_mm": round(float(np.interp(strap.length, strap.s, mapped)), 1),
                "source_length_mm": round(strap.length, 1),
                "thickness_mm": round(strap.thickness, 2),
                "droop_deg": round(math.degrees(hi_d), 2),
            }
        )
    band["positions"], band["normals"], band["along_mm"] = new_pos, new_nrm, along
    if spec.get("swap"):
        # The straps change lugs (a half turn about the case's axis): Google's model has the pin strap at 12 o'clock,
        # Jiatuo's watch the holed one.
        cx, cy = axis[:2]
        for part in [band] + ([post] if post is not None else []):
            part["positions"][:, 0] = 2 * cx - part["positions"][:, 0]
            part["positions"][:, 1] = 2 * cy - part["positions"][:, 1]
            part["normals"][:, :2] *= -1
        for r in report:
            r["lug"] = {"12": "6", "6": "12"}[r["lug"]]
    return report


def screen_image(spec, out_size):
    # The display, cut from the published cutout (never from Jiatuo's raw photos): the round area spec["centre_px"],
    # spec["radius_px"] (the screen mesh's whole disc), upright, resampled to out_size. It is the emissive texture of a
    # display lit under glass, so what the photo shows of the room (the glare on the glass, scratches, the dark
    # screen's grey) is taken out: only the lit pixels, the white and coloured text and the button, stay, on black.
    from scipy.ndimage import binary_dilation, binary_fill_holes, gaussian_filter

    src = Image.open(REPO / spec["from"]).convert("RGB")
    cx, cy = spec["centre_px"]
    r = spec["radius_px"]
    crop = src.transform((out_size, out_size), Image.EXTENT, (cx - r, cy - r, cx + r, cy + r), Image.BICUBIC)
    rgb = np.asarray(crop, dtype=np.float32) / 255
    value = rgb.max(2)
    sat = (value - rgb.min(2)) / np.maximum(value, 1e-6)
    lo, hi = spec.get("lit_value", [0.55, 0.75])
    lit = np.maximum(_smoothstep((value - lo) / (hi - lo)), _smoothstep((sat - 0.25) / 0.2) * _smoothstep((value - 0.3) / 0.15))
    # What the lit pixels enclose stays too: the button's dimmer label, the inside of a letter.
    shut = binary_dilation(lit > 0.5, iterations=max(1, out_size // 256))
    inside = binary_dilation(binary_fill_holes(shut) & ~shut, iterations=max(1, out_size // 256) + 1)
    keep = np.maximum(lit, gaussian_filter(inside.astype(np.float32), out_size / 1024))
    yy, xx = np.mgrid[0:out_size, 0:out_size]
    disc = np.hypot(xx + 0.5 - out_size / 2, yy + 0.5 - out_size / 2) / (out_size / 2)
    keep *= _smoothstep((spec.get("active", 0.97) - disc) / 0.02)
    # "erase": [[u, v, r], ...] in the picture's own units (0 to 1 across, from its top left): specks of glare and
    # scratches on the glass that pass for lit pixels.
    for u, v, rad in spec.get("erase", []):
        keep *= _smoothstep((np.hypot(xx + 0.5 - u * out_size, yy + 0.5 - v * out_size) / (rad * out_size) - 1) / 0.2)
    out = np.clip(rgb * keep[..., None] * spec.get("gain", 1.0), 0, 1)
    return Image.fromarray((out * 255 + 0.5).astype(np.uint8))


def clear_occlusion(img, part, keep_mm, keep_uv, work=1024):
    # The band's occlusion map was baked with the band closed in a loop, so it darkens what the loop hid: the holed
    # strap's tail tucked under the pin strap, the pin strap's end under the holed one, the inside of the loop. Laid
    # flat, nothing hides them, and the rubber is one even colour. So on the band's UV islands (and only there: the
    # atlas is shared with the case and crown) the map is cleared to the islands' open level, except within keep_mm of
    # each lug (the case shades the strap there in any layout) and round keep_uv, [[u, v, r], ...] (the G pressed
    # into the holed strap's underside, Google's mark, kept as it is). The holes and slots are cut through the
    # strap, so they still show.
    from scipy.ndimage import binary_dilation, gaussian_filter
    from scipy.spatial import cKDTree

    w, h = img.size
    mask = Image.new("L", (work, work), 0)
    draw = ImageDraw.Draw(mask)
    for t in part["uv"][part["faces"]] * work:
        draw.polygon([tuple(t[0]), tuple(t[1]), tuple(t[2])], fill=255)
    island = binary_dilation(np.asarray(mask) > 0, iterations=2)
    # How much of the original to keep, texel by texel: that of the nearest vertex (by its arc length from its lug).
    along = part["along_mm"]
    weight_v = 1 - _smoothstep((along - keep_mm) / 3.0)
    ys, xs = np.nonzero(island)
    nearest = cKDTree(part["uv"] * work).query(np.c_[xs + 0.5, ys + 0.5])[1]
    weight = np.zeros((work, work), np.float32)
    weight[ys, xs] = weight_v[nearest]
    weight = gaussian_filter(weight, 1.5)
    full = np.asarray(Image.fromarray(weight).resize((w, h), Image.BILINEAR), dtype=np.float32)
    inside = np.asarray(Image.fromarray(island.astype(np.uint8) * 255).resize((w, h), Image.BILINEAR), dtype=np.float32) / 255
    grey = np.asarray(img.convert("L"), dtype=np.float32) / 255
    level = float(np.percentile(grey[inside > 0.5], 90))
    cleared = grey * full + level * (1 - full)
    # The mark itself, lifted to the open level round it (the loop shaded its surroundings too).
    yy, xx = np.mgrid[0:h, 0:w]
    for u, v, r in keep_uv:
        disc = 1 - _smoothstep((np.hypot(xx + 0.5 - u * w, yy + 0.5 - v * h) / (r * w) - 1) / 0.5)
        local = float(np.percentile(grey[(disc > 0.5) & (inside > 0.5)], 90))
        mark = np.clip(grey * level / max(local, 1e-3), 0, 1)
        cleared = cleared * (1 - disc) + mark * disc
    out = grey * (1 - inside) + cleared * inside
    return Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8)).convert(img.mode if img.mode in ("L", "RGB") else "RGB")


def encode_image(img, fmt, quality):
    buf = io.BytesIO()
    if fmt == "png":
        img.save(buf, "PNG", optimize=True)
        return buf.getvalue(), "image/png"
    grey = img.mode == "L"
    img.convert("L" if grey else "RGB").save(buf, "JPEG", quality=quality, optimize=True, subsampling=0)
    return buf.getvalue(), "image/jpeg"


def write_glb(parts, materials, textures, images, meta, path):
    # A plain glTF 2.0 binary: one node per part, float positions, normals and UVs, 16-bit indices where they fit, the
    # images embedded; no extensions.
    import struct

    blob = bytearray()
    views, accessors = [], []

    def add(array, target=None, minmax=False):
        while len(blob) % 4:
            blob.append(0)
        raw = np.ascontiguousarray(array).tobytes()
        view = {"buffer": 0, "byteOffset": len(blob), "byteLength": len(raw)}
        if target:
            view["target"] = target
        views.append(view)
        blob.extend(raw)
        if array is None or minmax is None:
            return len(views) - 1
        kinds = {np.dtype(np.float32): 5126, np.dtype(np.uint16): 5123, np.dtype(np.uint32): 5125}
        acc = {
            "bufferView": len(views) - 1,
            "componentType": kinds[array.dtype],
            "count": int(array.shape[0]),
            "type": {1: "SCALAR", 2: "VEC2", 3: "VEC3"}[1 if array.ndim == 1 else array.shape[1]],
        }
        if minmax:
            acc["min"] = [float(v) for v in array.min(0)]
            acc["max"] = [float(v) for v in array.max(0)]
        accessors.append(acc)
        return len(accessors) - 1

    meshes, nodes = [], []
    for part in parts:
        attrs = {"POSITION": add(part["positions"].astype(np.float32), 34962, True)}
        attrs["NORMAL"] = add(part["normals"].astype(np.float32), 34962)
        if part.get("uv") is not None:
            attrs["TEXCOORD_0"] = add(part["uv"].astype(np.float32), 34962)
        index_type = np.uint16 if len(part["positions"]) < 65536 else np.uint32
        prim = {"attributes": attrs, "indices": add(part["faces"].astype(index_type).ravel(), 34963), "material": part["material"]}
        meshes.append({"name": part["name"], "primitives": [prim]})
        nodes.append({"name": part["name"], "mesh": len(meshes) - 1})
    image_json = []
    for name, data, mime in images:
        view = add(np.frombuffer(data, dtype=np.uint8), minmax=None)
        image_json.append({"name": name, "bufferView": view, "mimeType": mime})
    while len(blob) % 4:
        blob.append(0)
    gltf = {
        "asset": {"version": "2.0", "generator": "bin/build_journey_models.py (jiatuoz2.github.io)", **meta["asset"]},
        "scene": 0,
        "scenes": [{"name": meta["name"], "nodes": list(range(len(nodes))), "extras": {"journey": meta["journey"]}}],
        "nodes": nodes,
        "meshes": meshes,
        "materials": materials,
        "textures": textures["textures"],
        "samplers": textures["samplers"],
        "images": image_json,
        "accessors": accessors,
        "bufferViews": views,
        "buffers": [{"byteLength": len(blob)}],
    }
    text = json.dumps(gltf, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    text += b" " * (-len(text) % 4)
    total = 12 + 8 + len(text) + 8 + len(blob)
    data = struct.pack("<III", 0x46546C67, 2, total) + struct.pack("<I4s", len(text), b"JSON") + text
    data += struct.pack("<I4s", len(blob), b"BIN\x00") + bytes(blob)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return len(data)


def _texture_refs(material):
    # Every textureInfo in a material (base colour, metallic-roughness, normal, occlusion, emissive).
    pbr = material.get("pbrMetallicRoughness", {})
    for holder, key in [(pbr, "baseColorTexture"), (pbr, "metallicRoughnessTexture"), (material, "normalTexture"),
                        (material, "occlusionTexture"), (material, "emissiveTexture")]:
        if key in holder:
            yield holder[key]


def import_geometry(spec, gltf, binary):
    # The parts of an imported model, finished as geometry (see import_model), with the size and what was done.
    parts = [p for p in import_parts(gltf, binary, spec.get("variant")) if p["name"] not in spec.get("drop_nodes", [])]
    named = {p["name"]: p for p in parts}
    band_spec = spec.get("band")
    loose = {band_spec["node"], band_spec.get("post_node")} if band_spec else set()
    body = np.concatenate([p["positions"] for p in parts if p["name"] not in loose])
    case = named[spec["case_node"]]["positions"]
    # The case's axis (the middle of its own box, not of the body's, which the crown pulls aside) and the table: the
    # back of the body, which the watch lies on.
    axis = np.r_[(case.min(0)[:2] + case.max(0)[:2]) / 2, body.min(0)[2]]
    straps = lay_band_flat(named[band_spec["node"]], named.get(band_spec.get("post_node")), band_spec, axis, body.max(0)) if band_spec else []

    # The real size. The case is scaled to case_across_m across its face (the other size of the same watch), about
    # its axis; with "keep_thickness" the depth (Z here, the case's thickness and the band's) is kept, as both sizes
    # are the same thickness; nodes in keep_size (the crown) keep their own size and only move out with the case's
    # edge.
    across = float(np.max(case.max(0)[:2] - case.min(0)[:2]))
    k = spec["case_across_m"] / across
    factor = np.array([k, k, 1.0 if spec.get("keep_thickness") else k])
    edge = case.max(0)[0] - axis[0]
    for p in parts:
        if p["name"] in spec.get("keep_size", []):
            p["positions"] = p["positions"] + np.array([(k - 1) * edge, 0, 0])
            continue
        p["positions"] = (p["positions"] - axis) * factor + axis
        n = p["normals"] / factor
        p["normals"] = n / np.linalg.norm(n, axis=1, keepdims=True)

    import trimesh

    rx, ry, rz = (math.radians(a) for a in spec.get("rotate_deg", [0, 0, 0]))
    turn = trimesh.transformations.euler_matrix(rx, ry, rz, "sxyz")[:3, :3]
    for p in parts:
        p["positions"] = p["positions"] @ turn.T
        p["normals"] = p["normals"] @ turn.T
    allpos = np.concatenate([p["positions"] for p in parts])
    lo, hi = allpos.min(0), allpos.max(0)
    extents = hi - lo
    unit = 1.0 / float(extents.max())
    for p in parts:
        p["positions"] = (p["positions"] - (lo + hi) / 2) * unit
    return parts, extents, k, straps


def import_model(cfg, art_id, out_path, source=None):
    # Builds assets/models/journey/<id>.glb from the GLB in the entry's "import" block (see the comment at the top):
    # decoded, the chosen variant's materials baked in, the nodes in drop_nodes left out, the band laid flat and open
    # ("band", lay_band_flat), scaled to the real size ("case_across_m"), recoloured ("materials"), the screen's
    # picture replaced ("screen"), turned (rotate_deg), centred with its longest side 1, and written plain: no Draco,
    # no variants, only the materials and images still used, the images no larger than texture_max.
    import copy

    spec = cfg["import"]
    data, cached = fetch_import(spec, art_id, source)
    gltf, binary = read_glb(data)
    parts, extents, k, straps = import_geometry(spec, gltf, binary)
    band_spec = spec.get("band")

    # Materials: those still used, overridden by name ("materials": {name: {"name", "rgb" (sRGB 0-255, the base
    # colour), "metallic", "roughness"}}); the screen's gets the new picture as its emissive texture.
    screen = spec.get("screen")
    used = sorted({p["material"] for p in parts if p["material"] is not None})
    remap = {m: i for i, m in enumerate(used)}
    materials = [copy.deepcopy(gltf["materials"][m]) for m in used]
    textures = {"textures": [], "samplers": []}
    images, image_index, sampler_index, texture_index = [], {}, {}, {}
    tex_max = spec.get("texture_max", 2048)
    # The band's baked occlusion, cleared where the loop shaded it ("band": {"clear_occlusion"}).
    edits = {}
    if band_spec and band_spec.get("clear_occlusion"):
        band_part = next(p for p in parts if p["name"] == band_spec["node"])
        occlusion = gltf["materials"][band_part["material"]].get("occlusionTexture")
        if occlusion:
            source_index = gltf["textures"][occlusion["index"]]["source"]
            edits[source_index] = lambda img: clear_occlusion(img, band_part, band_spec["clear_occlusion"]["keep_mm"], band_spec["clear_occlusion"].get("keep_uv", []))

    def source_image(i):
        if i not in image_index:
            view = gltf["bufferViews"][gltf["images"][i]["bufferView"]]
            raw = binary[view.get("byteOffset", 0) : view.get("byteOffset", 0) + view["byteLength"]]
            img = Image.open(io.BytesIO(raw))
            img.load()
            if i in edits:
                img = edits[i](img)
            if max(img.size) > tex_max:
                img = img.resize((tex_max, tex_max * img.height // img.width), Image.LANCZOS)
            if img.mode in ("RGB", "RGBA", "L"):
                arr = np.asarray(img.convert("RGB"), dtype=np.int16)
                if np.abs(arr - arr[..., :1]).max() <= 2:
                    img = img.convert("L")
            fmt = "png" if img.mode == "RGBA" else "jpeg"
            data, mime = encode_image(img, fmt, spec.get("jpeg_quality", 90))
            image_index[i] = len(images)
            images.append((gltf["images"][i].get("name", f"image {i}"), data, mime))
        return image_index[i]

    def texture(source, sampler):
        if sampler is not None and sampler not in sampler_index:
            sampler_index[sampler] = len(textures["samplers"])
            textures["samplers"].append(gltf["samplers"][sampler])
        key = (source, sampler)
        if key not in texture_index:
            entry = {"source": source}
            if sampler is not None:
                entry["sampler"] = sampler_index[sampler]
            texture_index[key] = len(textures["textures"])
            textures["textures"].append(entry)
        return texture_index[key]

    screen_material = remap.get(next((p["material"] for p in parts if screen and p["name"] == screen["node"]), None))
    for i, material in enumerate(materials):
        if i == screen_material:
            material.pop("emissiveTexture", None)
        for ref in _texture_refs(material):
            src = gltf["textures"][ref["index"]]
            ref["index"] = texture(source_image(src["source"]), src.get("sampler"))
        change = spec.get("materials", {}).get(material.get("name"), {})
        if "name" in change:
            material["name"] = change["name"]
        pbr = material.setdefault("pbrMetallicRoughness", {})
        if "rgb" in change:
            linear = [((c / 255) / 12.92 if c / 255 <= 0.04045 else ((c / 255 + 0.055) / 1.055) ** 2.4) for c in change["rgb"]]
            pbr["baseColorFactor"] = [round(v, 5) for v in linear] + [pbr.get("baseColorFactor", [1, 1, 1, 1])[3]]
        if "metallic" in change:
            pbr["metallicFactor"] = change["metallic"]
        if "roughness" in change:
            pbr["roughnessFactor"] = change["roughness"]
    if screen_material is not None:
        picture = screen_image(screen, screen.get("size", 512))
        data, mime = encode_image(picture, "png" if screen.get("png") else "jpeg", screen.get("jpeg_quality", 92))
        images.append(("screen", data, mime))
        # A clamped, mipmapped sampler, as Google's watch faces had.
        sampler = gltf["textures"][gltf["materials"][used[screen_material]]["emissiveTexture"]["index"]].get("sampler")
        material = materials[screen_material]
        material["emissiveTexture"] = {"index": texture(len(images) - 1, sampler)}
        material["emissiveFactor"] = [1, 1, 1]
        material["name"] = screen.get("material_name", material.get("name"))
    for p in parts:
        p["material"] = remap.get(p["material"])
        if p["material"] is None or not list(_texture_refs(materials[p["material"]])):
            p["uv"] = None

    size_m = float(extents.max())
    meta = {
        "name": art_id,
        "asset": {"copyright": spec["copyright"]} if spec.get("copyright") else {},
        "journey": {
            "id": art_id,
            "size_m": round(size_m, 4),
            "extents_m": [round(float(e), 4) for e in extents],
            "source": spec["url"],
            "source_sha256": spec["sha256"],
            "changes": spec.get("changes", ""),
        },
    }
    nbytes = write_glb(parts, materials, textures, images, meta, out_path)
    return {
        "file": str(out_path),
        "bytes": nbytes,
        "triangles": int(sum(len(p["faces"]) for p in parts)),
        "vertices": int(sum(len(p["positions"]) for p in parts)),
        "images": [(name, len(data), mime) for name, data, mime in images],
        "extents_m": meta["journey"]["extents_m"],
        "size_m": round(size_m, 4),
        "case_scale": round(k, 4),
        "straps": straps,
        "cache": str(cached),
    }


# ---------------------------------------------------------------------------------------------------- previews

# Every side, so a part TRELLIS mirrored onto the hidden side (the 2019 robot's second ball) shows up.
VIEWS = [("front", 0, 8), ("3/4 left", -45, 12), ("side", 90, 8), ("back", 180, 8), ("other side", 270, 8), ("top 3/4", 35, 48)]


def look_at(eye):
    f = -eye / np.linalg.norm(eye)
    r = np.cross(f, [0, 1, 0])
    r = r / np.linalg.norm(r) if np.linalg.norm(r) > 1e-6 else np.array([1.0, 0, 0])
    u = np.cross(r, f)
    m = np.eye(4)
    m[0, :3], m[1, :3], m[2, :3] = r, u, -f
    m[:3, 3] = -m[:3, :3] @ eye
    return m


def render_views(glb_path, size=480, views=VIEWS):
    # Renders the finished GLB, not TRELLIS's intermediate, so the preview shows exactly what the site will load:
    # base colour texture under a soft key light, on the examine window's paper-grey backdrop.
    import torch, trimesh
    import nvdiffrast.torch as dr

    mesh = trimesh.load(glb_path, force="mesh")
    tex = np.asarray(mesh.visual.material.baseColorTexture.convert("RGB"), dtype=np.float32) / 255
    dev = "cuda"
    v = torch.tensor(mesh.vertices, dtype=torch.float32, device=dev)
    f = torch.tensor(mesh.faces, dtype=torch.int32, device=dev)
    uv = torch.tensor(mesh.visual.uv, dtype=torch.float32, device=dev)
    uv = torch.stack([uv[:, 0], 1 - uv[:, 1]], 1)
    n = torch.tensor(np.asarray(mesh.vertex_normals), dtype=torch.float32, device=dev)
    t = torch.tensor(tex, device=dev)[None]
    ctx = dr.RasterizeCudaContext()
    fov = math.radians(30)
    proj = np.zeros((4, 4))
    proj[0, 0] = proj[1, 1] = 1 / math.tan(fov / 2)
    proj[2, 2], proj[2, 3], proj[3, 2] = -(10 + 0.1) / (10 - 0.1), -2 * 10 * 0.1 / (10 - 0.1), -1
    light = torch.tensor([-0.35, 0.8, 0.5], device=dev)
    light = light / light.norm()
    frames = []
    for name, yaw, pitch in views:
        a, p = math.radians(yaw), math.radians(pitch)
        eye = 2.3 * np.array([math.sin(a) * math.cos(p), math.sin(p), math.cos(a) * math.cos(p)])
        mvp = torch.tensor(proj @ look_at(eye), dtype=torch.float32, device=dev)
        clip = torch.cat([v, torch.ones_like(v[:, :1])], 1) @ mvp.T
        rast, _ = dr.rasterize(ctx, clip[None], f, (size, size))
        tc, _ = dr.interpolate(uv[None], rast, f)
        col = dr.texture(t, tc, filter_mode="linear")
        nn_, _ = dr.interpolate(n[None], rast, f)
        nn_ = torch.nn.functional.normalize(nn_, dim=-1)
        shade = 0.55 + 0.5 * (nn_ @ light).abs().clamp(0, 1)[..., None]
        bg = torch.tensor([0.93, 0.92, 0.89], device=dev)
        img = torch.where(rast[..., 3:] > 0, (col * shade).clamp(0, 1), bg)
        img = dr.antialias(img, rast, clip[None], f)
        frames.append((name, Image.fromarray((img[0].flip(0).cpu().numpy() * 255).astype(np.uint8))))
    return frames


def preview(cfg, glb_path, out_png, label, size=480):
    frames = render_views(glb_path, size)
    src = Image.open(REPO / cfg["sources"][0] if not Path(cfg["sources"][0]).is_absolute() else cfg["sources"][0])
    src = src.convert("RGBA")
    src.thumbnail((size - 20, size - 20), Image.LANCZOS)
    panel = Image.new("RGB", (size, size), (237, 235, 227))
    panel.paste(src, ((size - src.width) // 2, (size - src.height) // 2), src)
    frames = [("source photo", panel)] + frames
    sheet = Image.new("RGB", (size * len(frames), size + 56), (250, 250, 248))
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("arial.ttf", 18)
    except OSError:
        font = ImageFont.load_default()
    for i, (name, im) in enumerate(frames):
        sheet.paste(im, (i * size, 0))
        draw.text((i * size + 10, size + 8), name, fill=(40, 40, 40), font=font)
    draw.text((10, size + 32), label, fill=(110, 110, 110), font=font)
    out_png.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out_png)
    return out_png


# ---------------------------------------------------------------------------------------------------- main


def main():
    ap = argparse.ArgumentParser(description="Build a My Journey artifact's 3D model (see the comment at the top).")
    ap.add_argument("id")
    ap.add_argument("--try", dest="tries", help="seeds to make candidates for, e.g. 1-6 or 2,5; writes nothing to the repo")
    ap.add_argument("--seed", type=int, help="seed to build and record in the table")
    ap.add_argument("--photos", nargs="+", help="photos of a new artifact to cut out and add to the table")
    ap.add_argument("--size-m", type=float, help="real length of the object's longest side, in metres")
    ap.add_argument("--board-image", action="store_true", help="also write the flat board cutout from the first photo")
    ap.add_argument("--adopt", type=int, metavar="SEED", help="write the --try candidate for SEED to the repo (no regeneration) and record it")
    ap.add_argument("--preview-dir", default=str(TOOLS / "previews"))
    ap.add_argument("--fit-pose", nargs="?", const=0, type=int, metavar="SEED",
                    help="print the photo's camera for the model (or the --try candidate for SEED), for 'project'")
    ap.add_argument("--import", dest="import_", action="store_true",
                    help="build the model from the GLB in the entry's \"import\" block (the default for such an entry)")
    ap.add_argument("--source", help="with --import: a copy of the GLB downloaded by hand, checked and cached")
    args = ap.parse_args()
    art_id = args.id
    if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", art_id):
        sys.exit("ids are lowercase words joined by hyphens, like the ids in _data/journey.yml")
    table = load_table()
    preview_dir = Path(args.preview_dir)

    if args.photos:
        if args.size_m is None:
            sys.exit("--size-m is needed for a new artifact")
        inputs = TOOLS / "inputs" / art_id
        cutouts = [cut_out(p, inputs / f"{i:02d}-{Path(p).stem}.png") for i, p in enumerate(args.photos)]
        entry = table["artifacts"].setdefault(art_id, {})
        entry.update({"sources": [c.as_posix() for c in cutouts], "size_m": args.size_m, "status": "pending"})
        save_table(table)
        if args.board_image:
            print("board cutout", board_image(cutouts[0], art_id))
        if not args.tries and args.seed is None:
            args.tries = "1-4"

    cfg = settings(table, art_id)
    if cfg.get("import") and (args.import_ or not (args.tries or args.seed is not None or args.adopt is not None or args.fit_pose is not None)):
        # A model imported from an existing GLB: no generator, no seed; the build is the table's import block.
        info = import_model(cfg, art_id, MODELS / f"{art_id}.glb", args.source)
        if info["bytes"] > cfg["max_bytes"]:
            sys.exit(f"{info['file']}: {info['bytes']} bytes, over max_bytes {cfg['max_bytes']}")
        print(json.dumps(info))
        return
    if args.import_:
        sys.exit(f"{art_id} has no \"import\" block in {TABLE.name}")
    if args.fit_pose is not None:
        import trimesh

        glb = TOOLS / "out" / art_id / f"seed-{args.fit_pose}.glb" if args.fit_pose else MODELS / f"{art_id}.glb"
        mesh = trimesh.load(glb, force="mesh")
        print(json.dumps(fit_photo_pose(mesh, mesh.visual.material.baseColorTexture, source_path(cfg))))
        return
    if args.adopt is not None:
        import trimesh

        # The candidate already went through finish(): it is turned, centred and scaled, its hues are fixed and its
        # boxes are cut and patched, so none of that is applied twice (a second hue_fix would push the orange ball to red).
        mesh = trimesh.load(TOOLS / "out" / art_id / f"seed-{args.adopt}.glb", force="mesh")
        done = {"rotate_deg": [0, 0, 0], "hue_fix": None, "true_extents_m": None, "flatten_top": None, "square_off": None}
        done.update({"remove_boxes": None, "patches": None, "project": None, "bumper_text": None, "repaint": None, "mirror_copy": None})
        info = finish(mesh, {**cfg, **done}, art_id, args.adopt, MODELS / f"{art_id}.glb")
        png = preview(cfg, Path(info["file"]), preview_dir / f"{art_id}.png", f"{art_id}  seed {args.adopt}  {info['triangles']} tris")
        table["artifacts"][art_id].update({"seed": args.adopt, "status": "keep"})
        save_table(table)
        print(json.dumps({"seed": args.adopt, **info, "preview": str(png)}))
        return
    if args.tries:
        for seed in parse_seeds(args.tries):
            mesh, raw = generate(cfg, seed, cfg["max_triangles"])
            glb = TOOLS / "out" / art_id / f"seed-{seed}.glb"
            info = finish(mesh, cfg, art_id, seed, glb)
            png = preview(cfg, glb, preview_dir / f"{art_id}-seed-{seed}.png", f"{art_id}  seed {seed}  {info['triangles']} tris")
            print(json.dumps({"seed": seed, "raw_faces": raw, **info, "preview": str(png)}))
        if not args.photos:
            return
    seed = args.seed if args.seed is not None else cfg["seed"]
    mesh, raw = generate(cfg, seed, cfg["max_triangles"])
    info = finish(mesh, cfg, art_id, seed, MODELS / f"{art_id}.glb")
    png = preview(cfg, Path(info["file"]), preview_dir / f"{art_id}.png", f"{art_id}  seed {seed}  {info['triangles']} tris")
    if args.seed is not None:
        table["artifacts"][art_id]["seed"] = seed
        save_table(table)
    print(json.dumps({"seed": seed, "raw_faces": raw, **info, "preview": str(png)}))


if __name__ == "__main__":
    main()
