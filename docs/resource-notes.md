# FMBE resource baseline handoff

Evidence status: source extraction and archive integrity verified; no Minecraft client, NetEase client, animation engine, or screenshot match was tested here.

## Locked source and files

- Official repository: https://github.com/Mojang/bedrock-samples
- Tag: `v1.21.120.4`
- Commit: `091dbd3ff9cf3c4205eb3c53ba4a673374b08472`
- Archive: `bedrock-samples-v1.21.120.4.zip`, 138815135 bytes.
- Archive SHA-256: `59011636c4f96794edca9033fe47b8806d00782e72fac41ec560ca4c31aac7c1`.
- `verification-report.json`: ZIP CRC succeeded. 245 selected original files match both archive bytes and the Git tree's blob SHA-1. No animation files are missing.
- `bedrock-1.21.120.4.min.json`: 481 full animation definitions from 138 source files, 168 animation controllers, source mapping, fox/player client entity definitions, fox/humanoid geometry, fox/player render controllers. Animation existence is not engine support certification.
- `official/`: original bytes, including selected fox/Steve/Alex textures, block/item textures and terrain/item texture atlases.
- `official-files.sha256.json`: path, size, SHA-256 of every selected original file.
- `animations.json` and `animation-sources.json`: plain maps convenient for early integration.
- `scale-candidates.json`: every scale channel on world/root/body/head, not just handpicked FMBE channels.
- `community-recipes.json` and the four named `.mcfunction` files: downloaded community basic and advanced command recipes. Preserve source attribution and mark uncalibrated. Advanced original author publication: https://github.com/szea-ll14/mcbe-cmd-memo/discussions/5 . The wiki source credits its contributors: https://wiki.bedrock.dev/commands/display-entities . This is not official Mojang source.
- `official/LICENSE.md`: Mojang copyright / Minecraft EULA; these game resources are not MIT-licensed application source.

The international resource pack is a reference baseline, not a verified byte-for-byte NetEase resource pack. NetEase build/platform/settings remain uncollected.

## Exact resource facts important to implementation

Fox hierarchy: `world -> root -> body -> head`. `held_item` is a locator in `head`, NOT a bone. Its model-space location is `[-2,5,-10]`; head pivot `[0,8,-3]`; body pivot `[0,8,0]`; root and world pivots `[0,0,0]`. Do not add the full head pivot twice when transforming the locator.

Fox client entity scripts run `setup`, conditional `baby_transform`, then `move`. Setup's body X rotation is `-this`. Baby head position is `[0,4,4]` when baby and its scale is 1.3. The default fox move controller adds look/walk behavior and has crouch, sit, sleep, stuck, wiggle, pounce states. Replacing the named move controller does not automatically remove other scripts. The render controller separately selects sleeping head mesh and hides legs/head in sleeping state.

`animation.player.sleeping` has `override_previous_animation: true`. Its head rotation is `[30-this,-this,-this]`. Root translation is `[24*cos(bodyYaw+sleepYaw),0,24*sin(bodyYaw+sleepYaw)]`; root rotation `[-90,270-sleepYaw-bodyYaw,0]`. It does real transforms; treating it as only a controller-disable sentinel would be wrong.

`animation.ender_dragon.neck_head_movement`: head rotation and position are each the corresponding variable minus `this`. Those expressions set the accumulated head channels, rather than add the variable blindly.

`animation.warden.move`: body rotation `[v.body_x_rot,0,v.body_z_rot]`, plus head rotation `[v.head_x_rot,0,v.head_z_rot]`. Initialize unwanted head variables explicitly if using it as a body-rotation primitive.

`animation.player.attack.rotations`: body rotation `[0,v.attack_body_rot_y,0]`. Its arm bones do not exist in fox geometry and must be ignored.

`animation.creeper.swelling`: both body and head scale are `[v.swelling_scale1,v.swelling_scale2,v.swelling_scale1]`; hence ancestor/descendant composition is essential.

`animation.happy_ghast.scale`: body scale `v.scale`. This is a uniformly scalable body, not an independent XYZ scale. Note possible namespace collision with FMBE's own `v.scale`.

`animation.minecart.move.v1.0`: inspect its full definition before using it as arbitrary root position; the newer animation name is not interchangeable with its v1.0 variant.

Player geometry is `models/entity/humanoid.custom.geo.json`, not `player.geo.json`. Player scripts.scale is 0.9375, and pre_animation contains game-state queries and assignments. The player resource references `geometry.cape`, but the selected explicit `cape.geo.json` path is absent in the official tag. Camera eye position cannot be inferred simply by moving the head bone.

## Units and coordinates

Official geometry units are 1/16 metre; angles are degrees and rotation order is X then Y then Z. Official animation channels accumulate before producing a transform, with `this` evaluated in the current channel context. Resource loading must preserve source format version. Missing bones are ignored.

Official sources:

- https://learn.microsoft.com/en-us/minecraft/creator/documents/animations/animationsoverview?view=minecraft-bedrock-stable
- https://learn.microsoft.com/en-us/minecraft/creator/reference/content/animationsreference/examples/animationcontroller
- https://learn.microsoft.com/en-us/minecraft/creator/documents/molang/syntax-guide?view=minecraft-bedrock-stable

The overview describes translated/rotated/scaled vertex application verbally. That description does not establish every row/column-vector convention, axis sign, pivot detail, or scale blending edge case needed by an independent engine. Calibrate those semantics; do not equate a Three.js Euler constructor with proof of Bedrock equivalence.

Entity yaw convention: 0 faces south (+Z), 90 west (-X). Fox model nose lies toward model -Z. The model-to-world adapter therefore needs a tested basis mapping; geometric appearance alone cannot certify it. Do not silently fix yaw inconsistencies with special-case FMBE matrices.

Molang expressions use degree trig and float values. Missing/unavailable engine queries need diagnostics; distinguish a valid false/zero from an unsupported query. Multi-statement expressions without a `return` evaluate to 0 according to official Molang syntax. Assignments in `stop_expression` therefore do not automatically stop the animation merely because the assigned final value is nonzero.

## FMBE recipe scope and compensation

Basic recipe parameters `pos` and `basepos` use 1/16 block units. Its scale assignment is `s1=2.1385*sqrt(xzscale*scale)` and `s2=2.1385*sqrt(yscale*scale)`.

Advanced recipe `pos` and `basepos` use block units; the original author demonstrates `ypos=1.5` as a 1.5 block offset. Its 3D held-block scale variable is `s=sqrt((32/7)*scale)` and its anisotropic axis is `swelling_scale2=extend_scale*s`, while `swelling_scale1=s`. It defines desired rotation matrix R, extension basis E, and P=R*E before solving body/head channel values. Full actual commands are in `advanced_3d_blocks.mcfunction`.

The 3D advanced recipe contains compensation constants `xpos-1`, `ypos-1/128`, `ybasepos+10/7`, `zbasepos-16/7`. 2D-block and flat-item recipes use different constants and a 25 degree compensation. These are community recipe parameters. The official fox geometry exposes the held_item locator but NOT a complete per-item engine holding transform. Consequently those constants cannot be labeled verified from fox.geo.json alone.

Potential item holding exceptions include trident, spyglass, bow, heads, banners, heavy core, conduit, decorated pot and button; shield is listed unsupported in the wiki. Do not apply a cube's compensation to arbitrary items. Likewise, a texture atlas is not a complete block/item shape catalog: fences, stairs, slabs, crossed sprites, special renderers and attachables need distinct shapes and holding transforms.

The advanced recipe's public controls are overall scale, one extension factor and extension orientation; they are not three independent diagonal scales. This resource scan found no native animation exposing independent XYZ scale variables on world/root/body/head. Fixed unequal scale channels exist (`arrow.move`, llama baby transforms, panda baby transform); keyframed nonuniform scales also exist. They are not automatically arbitrary programmable scales. A blanket claim that one vanilla fox can render every requested rectangular cuboid under this recipe is therefore unsupported. Reachability checks, measured extra recipes, multi-entity decomposition or an explicitly separate custom-resource-pack backend are necessary.

## Minimum calibration matrix

Test neutral held cube, yaw 0/90/180/270, head-only translation in each axis, single 90 degree head/body/root rotations, simultaneous body/head scale, nonuniform scale plus noncommuting rotation, 2D item compensation, repeated same-controller playanimation, different controller stacking, explicit/omitted next_state, stop_expression side effects and stop timing, blend-out and re-entry, culling/unloading, adult/baby fox, each player camera view and at least two viewers.

Keep experimental exports possible with all unresolved items visible. None of this file certifies any case against a running game.
