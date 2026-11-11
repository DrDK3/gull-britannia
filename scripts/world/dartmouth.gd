extends Node3D
## Compact Dartmouth waterfront, 1967 (alternate history). Built from
## primitives at load time.
##
## Axes: +X is east (the river and Kingswear), +Z is south (towards the
## harbour mouth and the sea), -Z is north (upriver). Water is at y = 0 and the
## quays at y = 2. See SOURCES.md for what is verified and what is approximate.

const Pal = preload("res://scripts/world/palette.gd")
const Builder = preload("res://scripts/world/builder.gd")
const Ferry = preload("res://scripts/world/ferry.gd")
const AmbientGull = preload("res://scripts/world/ambient_gull.gd")
const People = preload("res://scripts/actors/people.gd")

const QUAY := 2.0
const FLOOR_H := 2.8

# Landmarks used by missions.
const COVE_TABLE := Vector3(5.4, QUAY, 73.0)
const COVE_POST := Vector3(11.0, QUAY, 75.0)
const COVE_RIVER := Vector3(28.5, QUAY, 76.0)
const COVE_FORT := Vector3(20.0, QUAY, 100.5)
const COVE_PUMP := Vector3(14.5, QUAY, 101.0)
const COVE_KITCHEN := Vector3(-3.0, QUAY, 44.0)
const COVE_BARREL := Vector3(12.6, QUAY, 73.2)
const BAKERY_SILL := Vector3(4.35, QUAY + 1.05, 53.0)
const NEST := Vector3(-26.0, 15.05, 7.0)
const DOROTHY_MAY := Vector3(-2.0, 0.0, -44.0)
const STATION_ROOF := Vector3(28.0, 9.55, -4.0)
const CHURCH_TOWER := Vector3(-88.0, 28.4, -37.0)
const HARBOUR_GUTTER := Vector3(4.15, 10.95, 70.5)
const HARBOUR_CHIMNEY := Vector3(-2.0, 15.85, 78.5)
const COVE_LAMP := Vector3(30.5, 6.75, 64.0)
const BRIXHAM_MAST := Vector3(42.0, 9.55, 82.0)
const FORT_PARAPET := Vector3(25.5, 5.85, 112.0)
const DINER_BENCH := Vector3(33.0, QUAY, -24.0)
const HOTEL_ROOF := Vector3(-50.0, 18.3, -40.0)

var b: Builder
var opts: Dictionary = {}
var ferries: Array = []
var labels_root: Node3D
var props_root: Node3D
var wake_root: Node3D
var sun: DirectionalLight3D
var env: WorldEnvironment


func build(options := {}) -> void:
	opts = options
	b = Builder.new(self, "Town")
	labels_root = Node3D.new()
	labels_root.name = "Signs"
	add_child(labels_root)
	props_root = Node3D.new()
	props_root.name = "Props"
	add_child(props_root)
	wake_root = Node3D.new()
	wake_root.name = "Wakes"
	add_child(wake_root)
	_environment()
	_water()
	_land()
	_embankment()
	_boat_float()
	_the_quay()
	_town()
	_church()
	_bayards_cove()
	_hillside()
	_kingswear()
	_harbour_mouth()
	_river_boats()
	_occupation()
	b.commit()
	_ferries()
	_ambient_gulls()


# --------------------------------------------------------------------------
# Atmosphere
# --------------------------------------------------------------------------

func _environment() -> void:
	env = WorldEnvironment.new()
	var e := Environment.new()
	var sky := Sky.new()
	var psm := ProceduralSkyMaterial.new()
	psm.sky_top_color = Color(0.36, 0.54, 0.76)
	psm.sky_horizon_color = Color(0.76, 0.80, 0.82)
	psm.ground_bottom_color = Color(0.30, 0.30, 0.29)
	psm.ground_horizon_color = Color(0.68, 0.72, 0.75)
	psm.sun_angle_max = 25.0
	sky.sky_material = psm
	e.background_mode = Environment.BG_SKY
	e.sky = sky
	# A fixed cool fill: sky-sourced ambient over-lit every upward face.
	e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	e.ambient_light_color = Color(0.62, 0.68, 0.76)
	e.ambient_light_energy = 0.55
	e.reflected_light_source = Environment.REFLECTION_SOURCE_DISABLED
	e.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	e.tonemap_exposure = 1.0
	e.fog_enabled = true
	e.fog_light_color = Color(0.70, 0.76, 0.82)
	e.fog_density = float(opts.get("fog", 0.0006))
	e.fog_sky_affect = 0.15
	env.environment = e
	add_child(env)
	sun = DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-48.0, -140.0, 0.0)
	sun.light_color = Color(1.0, 0.95, 0.86)
	sun.light_energy = 1.0
	sun.shadow_enabled = true
	sun.shadow_blur = 1.5
	sun.directional_shadow_max_distance = 110.0
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_4_SPLITS
	add_child(sun)


func _water() -> void:
	var mi := MeshInstance3D.new()
	var pm := PlaneMesh.new()
	pm.size = Vector2(1500, 1500)
	pm.subdivide_width = 120
	pm.subdivide_depth = 120
	mi.mesh = pm
	mi.material_override = Pal.mat("water")
	mi.position = Vector3(80, 0, 0)
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	mi.name = "Water"
	add_child(mi)
	var wb := StaticBody3D.new()
	wb.name = "WaterSurface"
	wb.collision_layer = Builder.LAYER_WATER
	wb.collision_mask = 0
	var cs := CollisionShape3D.new()
	var bs := BoxShape3D.new()
	bs.size = Vector3(1500, 1.0, 1500)
	cs.shape = bs
	cs.position = Vector3(80, -0.5, 0)
	wb.add_child(cs)
	add_child(wb)


func _land_box(x0: float, x1: float, z0: float, z1: float, top: float, top_key: String, side_key := "quay_wall") -> void:
	var depth := top + 4.0
	b.box(side_key, Vector3((x0 + x1) * 0.5, top - depth * 0.5, (z0 + z1) * 0.5), Vector3(x1 - x0, depth, z1 - z0), 0.0, true, top_key)


func _land() -> void:
	# Royal Avenue Gardens (north of the Boat Float) and land upriver.
	_land_box(-95, 22, -200, -62, QUAY, "grass")
	# The Quay (west side of the Boat Float).
	_land_box(-95, -22, -62, -28, QUAY, "cobble")
	# South quay of the Boat Float.
	_land_box(-95, 22, -28, -18, QUAY, "cobble")
	# Town block south of the Boat Float.
	_land_box(-95, 22, -18, 40, QUAY, "setts")
	# Lane between town and Bayards Cove.
	_land_box(-95, 32, 40, 48, QUAY, "setts")
	# Bayards Cove buildings' land and the cove quay.
	_land_box(-95, 4, 48, 122, QUAY, "setts")
	_land_box(4, 32, 48, 122, QUAY, "cobble")
	# Wooded slope rising south of the cove towards the castle path.
	_land_box(-95, 32, 122, 128, QUAY + 0.6, "rock", "rock")
	b.ramp("hill", Vector3(-30, QUAY + 0.5, 126), Vector3(-30, 24, 196), 132.0, 5.0)
	for i in 9:
		var bx := 22.0 + fmod(i * 7.3, 12.0)
		var bz := 128.0 + i * 7.0
		b.box("rock", Vector3(bx, QUAY + 0.6 + (bz - 126.0) * 0.32, bz), Vector3(3.0 + fmod(i * 1.7, 2.0), 2.4, 3.2), i * 0.7, true)
	for i in 14:
		var tx := -60.0 + fmod(i * 23.0, 80.0)
		var tz := 134.0 + fmod(i * 13.0, 55.0)
		_tree(Vector3(tx, QUAY + 0.5 + (tz - 126.0) * (21.5 / 70.0), tz), 3.5 + fmod(i * 0.9, 1.8))
	# South Embankment, split around the Boat Float entrance.
	_land_box(22, 36, -200, -50, QUAY, "paving")
	_land_box(22, 36, -38, 40, QUAY, "paving")
	# Road surface strip along the embankment.
	b.box("tarmac", Vector3(26.5, QUAY + 0.01, -80), Vector3(5.0, 0.02, 240), 0.0, false)
	# Bridge over the Boat Float entrance (cast-iron girders).
	b.box("paving", Vector3(29, QUAY - 0.35, -44), Vector3(14, 0.7, 12.4), 0.0, true, "tarmac")
	for x in [22.4, 35.6]:
		b.box("iron_green", Vector3(x, QUAY - 0.75, -44), Vector3(0.6, 1.0, 12.4), 0.0, true)


func _rail(x0: float, z0: float, x1: float, z1: float, y: float, key := "rail_white") -> void:
	var a := Vector3(x0, y, z0)
	var c := Vector3(x1, y, z1)
	var d := c - a
	var length := d.length()
	var yaw := atan2(d.x, d.z)
	b.box(key, (a + c) * 0.5 + Vector3(0, 1.0, 0), Vector3(0.08, 0.08, length), yaw, false)
	b.box(key, (a + c) * 0.5 + Vector3(0, 0.55, 0), Vector3(0.05, 0.05, length), yaw, false)
	var n := int(length / 2.5)
	for i in n + 1:
		var p := a.lerp(c, float(i) / maxf(n, 1))
		b.box(key, p + Vector3(0, 0.5, 0), Vector3(0.07, 1.0, 0.07), 0.0, false)


func lamp_post(pos: Vector3, height := 4.6) -> void:
	b.cylinder("iron_green", pos + Vector3(0, height * 0.5, 0), 0.09, height, 8, true, 0.06)
	b.cylinder("iron_green", pos + Vector3(0, 0.3, 0), 0.18, 0.6, 8, true)
	b.box("lamp", pos + Vector3(0, height + 0.25, 0), Vector3(0.36, 0.4, 0.36), 0.0, true)
	b.box("iron_green", pos + Vector3(0, height + 0.5, 0), Vector3(0.6, 0.08, 0.6), 0.0, true)


func bollard(pos: Vector3) -> void:
	b.cylinder("iron", pos + Vector3(0, 0.35, 0), 0.16, 0.7, 8, true, 0.13)


func sign_label(text: String, pos: Vector3, yaw: float, size := 1.0, color := Color(0.95, 0.92, 0.82), outline := true) -> Label3D:
	var l := Label3D.new()
	l.text = text
	l.font_size = 64
	l.pixel_size = 0.0055 * size
	l.modulate = color
	l.outline_size = 10 if outline else 0
	l.outline_modulate = Color(0.05, 0.05, 0.05, 0.9)
	l.double_sided = false
	l.position = pos
	l.rotation = Vector3(0, yaw, 0)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	labels_root.add_child(l)
	return l


# --------------------------------------------------------------------------
# Buildings
# --------------------------------------------------------------------------

const FACING := {
	"east": [Vector3(1, 0, 0), PI * 0.5],
	"west": [Vector3(-1, 0, 0), -PI * 0.5],
	"north": [Vector3(0, 0, -1), PI],
	"south": [Vector3(0, 0, 1), 0.0],
}


## A painted terrace house or shop. Returns the eaves height.
func house(x0: float, x1: float, z0: float, z1: float, floors: int, wall_key: String, front := "east", o := {}) -> float:
	var base: float = o.get("base", QUAY)
	var sink: float = o.get("sink", 0.0)
	var wall_h := floors * FLOOR_H + 0.4
	var cx := (x0 + x1) * 0.5
	var cz := (z0 + z1) * 0.5
	var w := x1 - x0
	var d := z1 - z0
	b.box(wall_key, Vector3(cx, base + (wall_h - sink) * 0.5, cz), Vector3(w, wall_h + sink, d), 0.0, true)
	var eaves := base + wall_h
	var facing: Array = FACING[front]
	var n: Vector3 = facing[0]
	var yaw: float = facing[1]
	var along_x := front == "north" or front == "south"
	var frontage := w if along_x else d
	var depth := d if along_x else w
	var roof_key: String = o.get("roof", "slate")
	var roof_h: float = o.get("roof_h", depth * 0.36)
	if o.get("hip", false):
		b.hip_roof(roof_key, Vector3(cx, eaves, cz), frontage, depth, roof_h, 0.0 if along_x else PI * 0.5, 0.35)
	else:
		b.gable_roof(roof_key, wall_key, Vector3(cx, eaves, cz), frontage, depth, roof_h, 0.0 if along_x else PI * 0.5, 0.3)
	# Chimney stacks on the gable ends.
	if o.get("chimneys", true):
		var stack_key: String = o.get("stack", "stone_wall")
		for side in [-1.0, 1.0]:
			var off: float = (frontage * 0.5 - 0.6) * side
			var sp := Vector3(cx + (off if along_x else 0.0), eaves + roof_h * 0.85, cz + (0.0 if along_x else off))
			b.box(stack_key, sp, Vector3(0.8 if along_x else 1.6, 2.2, 1.6 if along_x else 0.8), 0.0, true)
			for k in 2:
				var pot := sp + Vector3(0, 1.3, 0) + (Vector3(0, 0, (k - 0.5) * 0.6) if not along_x else Vector3((k - 0.5) * 0.6, 0, 0))
				b.cylinder("chimney_pot", pot, 0.12, 0.45, 6, false)
	# Front and back windows.
	var face_c := Vector3(cx, 0, cz) + n * (depth * 0.5)
	var right := Vector3.UP.cross(n).normalized()
	var cols := maxi(1, int(frontage / 3.0))
	var shop: String = o.get("shop", "")
	var door_col := int(floor(cols * 0.5))
	var back_windows: bool = o.get("back_windows", true)
	for f in floors:
		var y := base + f * FLOOR_H + 1.6
		for c in cols:
			var t := (float(c) + 0.5) / cols - 0.5
			var p := face_c + right * (t * frontage)
			if f == 0 and shop != "":
				continue
			if f == 0 and c == door_col and o.get("door", true):
				_door(p, n, base, str(o.get("door_key", "door_green")))
				continue
			_window(p + Vector3(0, y, 0), n)
			if back_windows:
				var back := Vector3(cx, y, cz) - n * (depth * 0.5) + right * (t * frontage)
				_window(back, -n)
	if shop != "":
		_shopfront(face_c, n, right, frontage, base, shop, str(o.get("fascia", "fascia_green")), yaw, bool(o.get("shuttered", false)))
	return eaves


func _window(center: Vector3, n: Vector3) -> void:
	var frame_c := center + n * 0.03
	var size_frame := Vector3(1.05, 1.4, 0.06)
	var size_glass := Vector3(0.85, 1.2, 0.06)
	var yaw := atan2(n.x, n.z)
	b.box("frame", frame_c, size_frame, yaw, false, "", false)
	b.box("glass", center + n * 0.06, size_glass, yaw, false, "", false)
	b.box("frame", center + n * 0.08, Vector3(0.06, 1.2, 0.03), yaw, false, "", false)
	b.box("frame", center + n * 0.08, Vector3(0.85, 0.05, 0.03), yaw, false, "", false)
	b.box("frame", center + n * 0.08 - Vector3(0, 0.72, 0), Vector3(1.15, 0.08, 0.12), yaw, false, "", false)


func _door(p: Vector3, n: Vector3, base: float, key: String) -> void:
	var yaw := atan2(n.x, n.z)
	b.box("frame", p + Vector3(0, base + 1.15, 0) + n * 0.02, Vector3(1.25, 2.4, 0.05), yaw, false, "", false)
	b.box(key, p + Vector3(0, base + 1.05, 0) + n * 0.05, Vector3(1.0, 2.1, 0.06), yaw, false, "", false)


func _shopfront(face_c: Vector3, n: Vector3, right: Vector3, frontage: float, base: float, text: String, fascia: String, yaw: float, shuttered: bool) -> void:
	var w := frontage - 0.8
	var wyaw := atan2(n.x, n.z)
	b.box(fascia, face_c + Vector3(0, base + 3.05, 0) + n * 0.12, Vector3(w + 0.3, 0.7, 0.2), wyaw, false, "", false)
	if shuttered:
		b.box("wood", face_c + Vector3(0, base + 1.4, 0) + n * 0.06, Vector3(w, 2.5, 0.08), wyaw, false, "", false)
		for i in 6:
			b.box("wood_light", face_c + Vector3(0, base + 0.4 + i * 0.42, 0) + n * 0.11, Vector3(w, 0.06, 0.03), wyaw, false, "", false)
	else:
		b.box(fascia, face_c + Vector3(0, base + 0.35, 0) + n * 0.08, Vector3(w, 0.7, 0.14), wyaw, false, "", false)
		b.box("glass", face_c + Vector3(0, base + 1.7, 0) + right * (-0.6) + n * 0.06, Vector3(w - 1.6, 2.0, 0.06), wyaw, false, "", false)
		b.box(fascia, face_c + Vector3(0, base + 1.1, 0) + right * (w * 0.5 - 0.6) + n * 0.08, Vector3(1.0, 2.2, 0.08), wyaw, false, "", false)
	var lbl := sign_label(text, face_c + Vector3(0, base + 3.05, 0) + n * 0.24, yaw, 0.55, Color(0.97, 0.9, 0.6))
	lbl.outline_size = 4
	if shuttered:
		sign_label("CLOSED BY ORDER", face_c + Vector3(0, base + 1.5, 0) + n * 0.2, yaw, 0.35, Color(0.9, 0.2, 0.15))


# --------------------------------------------------------------------------
# Areas
# --------------------------------------------------------------------------

func _embankment() -> void:
	# River railings and lamp posts along the South Embankment.
	_rail(36.0, -110.0, 36.0, -50.5, QUAY)
	_rail(36.0, -37.5, 36.0, -9.0, QUAY)
	_rail(36.0, -1.0, 36.0, 34.0, QUAY)
	for z in [-105.0, -85.0, -65.0, -30.0, -15.0, 8.0, 24.0]:
		lamp_post(Vector3(35.2, QUAY, z))
	for z in [-95.0, -75.0, -57.0, -20.0, 15.0, 30.0]:
		bollard(Vector3(35.4, QUAY, z))
	# Benches facing the river.
	for z in [-24.0, -70.0, 18.0]:
		_bench(Vector3(33.0, QUAY, z), -PI * 0.5)
	# The station: booking office for trains that leave from Kingswear.
	var ev := house(24, 32, -12, 4, 1, "wall_cream", "east", {"hip": true, "roof_h": 2.0, "door": true, "door_key": "door_red", "chimneys": false})
	b.box("wood", Vector3(33.0, ev - 0.3, -4.0), Vector3(2.4, 0.15, 15.0), 0.0, true)
	for z in [-10.0, -4.0, 2.0]:
		b.box("iron_green", Vector3(34.0, QUAY + 1.6, z), Vector3(0.14, 3.2, 0.14), 0.0, true)
	b.box("wood_light", Vector3(28, ev + 2.1, -4), Vector3(1.0, 1.4, 1.0), 0.0, true)
	b.hip_roof("lead", Vector3(28, ev + 2.8, -4), 1.2, 1.2, 0.8)
	sign_label("DARTMOUTH", Vector3(32.12, QUAY + 4.1, -4.0), PI * 0.5, 1.4)
	sign_label("BRITISH RAILWAYS  ·  BOOKING OFFICE\nFERRY TO KINGSWEAR FOR TRAINS", Vector3(32.12, QUAY + 3.3, -4.0), PI * 0.5, 0.5)
	# Covered passenger ferry pontoon and gangway.
	b.box("wood", Vector3(47, 0.45, -5), Vector3(18, 0.7, 6), 0.0, true, "deck")
	for x in [39.0, 47.0, 55.0]:
		for z in [-7.6, -2.4]:
			b.box("wood", Vector3(x, 1.95, z), Vector3(0.2, 2.4, 0.2), 0.0, false)
	b.gable_roof("lead", "wood", Vector3(47, 3.15, -5), 18, 6, 1.2, 0.0, 0.25)
	b.ramp("wood", Vector3(36.0, QUAY, -5.0), Vector3(38.2, 0.85, -5.0), 2.0, 0.2)
	# Lower Ferry slipway (Dartmouth side).
	b.ramp("setts", Vector3(32.0, QUAY, 43.0), Vector3(52.0, -1.2, 43.0), 9.0, 0.6)
	# A K6 telephone kiosk and a pillar box.
	_phone_box(Vector3(23.4, QUAY, 8.0))
	b.cylinder("gpo_red", Vector3(23.6, QUAY + 0.75, -16.0), 0.28, 1.5, 10, true)
	b.cylinder("gpo_red", Vector3(23.6, QUAY + 1.58, -16.0), 0.3, 0.16, 10, true, 0.18)


func _bench(pos: Vector3, yaw: float) -> void:
	var r := Basis(Vector3.UP, yaw)
	b.box("wood", pos + r * Vector3(0, 0.45, 0), Vector3(1.8, 0.08, 0.45).abs(), yaw, true)
	b.box("wood", pos + r * Vector3(0, 0.8, 0.2), Vector3(1.8, 0.4, 0.06), yaw, true)
	for s in [-0.8, 0.8]:
		b.box("iron", pos + r * Vector3(s, 0.22, 0), Vector3(0.06, 0.45, 0.4), yaw, false)


func _phone_box(pos: Vector3) -> void:
	b.box("gpo_red", pos + Vector3(0, 1.25, 0), Vector3(0.95, 2.5, 0.95), 0.0, true)
	b.box("gpo_red", pos + Vector3(0, 2.6, 0), Vector3(1.05, 0.2, 1.05), 0.0, true)
	for f in FACING.values():
		var n: Vector3 = f[0]
		b.box("glass", pos + Vector3(0, 1.3, 0) + n * 0.49, Vector3(0.6, 1.5, 0.02), atan2(n.x, n.z), false, "", false)
		b.box("lamp", pos + Vector3(0, 2.35, 0) + n * 0.49, Vector3(0.6, 0.14, 0.02), atan2(n.x, n.z), false, "", false)


func _boat_float() -> void:
	# Low stone parapet around the basin with gaps for steps.
	for seg in [[-22.0, -62.0, 22.0, -62.0], [-22.0, -28.0, 22.0, -28.0], [-22.0, -62.0, -22.0, -28.0]]:
		var a := Vector3(seg[0], QUAY, seg[1])
		var c := Vector3(seg[2], QUAY, seg[3])
		var mid := (a + c) * 0.5
		var length := a.distance_to(c)
		var yaw := atan2(c.x - a.x, c.z - a.z)
		b.box("stone_wall", mid + Vector3(0, 0.25, 0), Vector3(0.5, 0.5, length), yaw, true)
	# The crabber Dorothy May (Resistance drop) and small craft.
	boat(DOROTHY_MAY, PI * 0.5, 10.0, "hull_blue", {"cabin": true, "name": "DOROTHY MAY", "mast": 5.0, "pots": true})
	boat(Vector3(-14, 0, -55), 0.3, 4.2, "hull_white", {"dinghy": true})
	boat(Vector3(12, 0, -34), -0.4, 4.0, "hull_green", {"dinghy": true})
	boat(Vector3(8, 0, -56), 1.4, 5.5, "hull_red", {"cabin": false, "mast": 3.0})
	boat(Vector3(-12, 0, -33), 2.0, 3.6, "hull_white", {"dinghy": true})
	boat(Vector3(14, 0, -46), 1.6, 6.0, "hull_white", {"cabin": true})


func _the_quay() -> void:
	# Royal Castle Hotel on the Quay, facing east across the Boat Float.
	var hotel_eaves := house(-60, -40, -50, -30, 4, "wall_white", "east", {"door": true, "door_key": "door_blue", "roof_h": 4.5})
	b.box("wall_white", Vector3(-39.6, QUAY + 8.0, -40), Vector3(0.8, 12, 10), 0.0, true)
	sign_label("ROYAL CASTLE HOTEL", Vector3(-39.1, QUAY + 10.6, -40.0), PI * 0.5, 0.9, Color(0.15, 0.15, 0.2), false)
	sign_label("OFFICERS' MESS — BY ORDER", Vector3(-39.1, QUAY + 3.3, -40.0), PI * 0.5, 0.5, Color(0.85, 0.12, 0.1))
	_flag(Vector3(-50, hotel_eaves + 4.5, -40), 4.0)
	# Neighbours on the Quay.
	house(-60, -40, -62, -50, 3, "wall_cream", "east", {"shop": "QUAY STORES", "fascia": "fascia_blue"})
	house(-60, -40, -30, -18, 3, "wall_pink", "east", {})
	# The Butterwalk (north side of Duke Street): granite piers, jettied
	# timber-framed upper floors. Simplified massing; see SOURCES.md.
	var bx0 := -80.0
	var bx1 := -42.0
	var z_front := -64.0
	b.box("stone_wall", Vector3((bx0 + bx1) * 0.5, QUAY + 1.6, -71.0), Vector3(bx1 - bx0, 3.2, 10.0), 0.0, true)
	for i in 11:
		var px := lerpf(bx0 + 1.0, bx1 - 1.0, float(i) / 10.0)
		b.box("granite", Vector3(px, QUAY + 1.6, z_front - 0.5), Vector3(0.6, 3.2, 0.6), 0.0, true)
	b.box("plaster_timber", Vector3((bx0 + bx1) * 0.5, QUAY + 5.5, -70.0), Vector3(bx1 - bx0, 4.6, 12.0), 0.0, true)
	for i in 20:
		var tx := lerpf(bx0 + 0.6, bx1 - 0.6, float(i) / 19.0)
		b.box("timber", Vector3(tx, QUAY + 5.5, -63.95), Vector3(0.25, 4.6, 0.1), 0.0, false)
	b.box("timber", Vector3((bx0 + bx1) * 0.5, QUAY + 3.3, -63.9), Vector3(bx1 - bx0, 0.3, 0.12), 0.0, false)
	b.box("timber", Vector3((bx0 + bx1) * 0.5, QUAY + 7.7, -63.9), Vector3(bx1 - bx0, 0.3, 0.12), 0.0, false)
	for i in 4:
		var gx := lerpf(bx0 + 4.75, bx1 - 4.75, float(i) / 3.0)
		b.gable_roof("slate_old", "plaster_timber", Vector3(gx, QUAY + 7.8, -70.0), 12.0, 9.0, 4.2, PI * 0.5, 0.2)
		for k in 3:
			_window(Vector3(gx - 2.5 + k * 2.5, QUAY + 5.3, -64.0), Vector3(0, 0, 1))
	sign_label("THE BUTTERWALK", Vector3(-61.0, QUAY + 2.9, -63.4), 0.0, 0.5)
	# South side of Duke Street.
	house(-95, -78, -56, -48, 3, "wall_yellow", "north", {"shop": "W. H. GILLARD  ·  IRONMONGER", "fascia": "fascia_black"})
	house(-78, -62, -56, -48, 3, "wall_blue", "north", {"shop": "NEWSAGENT  ·  TOBACCONIST", "fascia": "fascia_red"})


func _town() -> void:
	# Embankment-facing row (fronts face east).
	house(8, 22, -18, -8, 3, "wall_blue", "east", {"shop": "FISH  &  CHIPS", "fascia": "fascia_red"})
	house(8, 22, -8, 2, 3, "wall_cream", "east", {"shop": "HARBOUR TEAS", "fascia": "fascia_green", "shuttered": bool(opts.get("shuttered", false))})
	house(8, 22, 2, 12, 4, "wall_pink", "east", {"shop": "SHIP CHANDLER", "fascia": "fascia_blue"})
	house(8, 22, 12, 22, 3, "wall_yellow", "east", {})
	house(8, 22, 22, 31, 3, "wall_white", "east", {"shop": "R. NANCEKIVELL  ·  FAMILY BUTCHER", "fascia": "fascia_red", "shuttered": bool(opts.get("shuttered", false))})
	house(8, 22, 31, 40, 2, "wall_green", "east", {})
	# Second row (fronts face east onto Lower Street, x -2..8).
	house(-14, -2, -18, -6, 3, "wall_ochre", "east", {})
	house(-14, -2, -6, 6, 4, "wall_white", "east", {"shop": "POST OFFICE", "fascia": "fascia_red"})
	house(-14, -2, 6, 16, 3, "wall_lilac", "east", {})
	house(-14, -2, 16, 28, 3, "wall_cream", "east", {"shop": "PENROSE  ·  WINES & SPIRITS", "fascia": "fascia_black"})
	house(-14, -2, 28, 40, 3, "wall_blue", "east", {})
	# Third row (fronts face east, x -22..-14 street). The nest house.
	house(-40, -22, -18, -6, 3, "wall_grey", "east", {})
	house(-40, -22, -6, 2, 3, "wall_yellow", "east", {})
	var nest_eaves := house(-40, -22, 2, 12, 3, "wall_pink", "east", {"chimneys": false})
	b.box("stone_wall", Vector3(-26, nest_eaves + 1.9, 7.0), Vector3(1.4, 3.8, 1.4), 0.0, true)
	b.box("stone_wall", Vector3(-26, 14.85, 7.0), Vector3(1.6, 0.2, 1.6), 0.0, true)
	house(-40, -22, 12, 24, 4, "wall_white", "east", {})
	house(-40, -22, 24, 40, 3, "wall_green", "east", {})
	# Fourth row, up towards the hill.
	house(-70, -48, -18, -4, 3, "wall_cream", "east", {})
	house(-70, -48, -4, 10, 4, "wall_blue", "east", {})
	house(-70, -48, 10, 24, 3, "wall_ochre", "east", {})
	house(-70, -48, 24, 40, 3, "wall_pink", "east", {})
	house(-92, -74, -18, 10, 3, "wall_white", "east", {})
	house(-92, -74, 10, 40, 3, "wall_yellow", "east", {})
	# Lamp posts in the streets.
	for p in [Vector3(3, QUAY, -10), Vector3(3, QUAY, 20), Vector3(-18, QUAY, 0), Vector3(-18, QUAY, 30)]:
		lamp_post(p, 4.0)


func _church() -> void:
	# St Saviour's: nave and a battlemented west tower (simplified massing).
	b.box("stone_wall", Vector3(-75, QUAY + 4.5, -37), Vector3(18, 9, 12), 0.0, true)
	b.gable_roof("slate_old", "stone_wall", Vector3(-75, QUAY + 9.0, -37), 18, 12, 4.5, 0.0, 0.3)
	b.box("stone_wall", Vector3(-88, QUAY + 13.0, -37), Vector3(8, 26, 8), 0.0, true)
	b.box("stone_wall", Vector3(-88, QUAY + 26.15, -37), Vector3(8.3, 0.3, 8.3), 0.0, true)
	for i in 4:
		for side in [-1.0, 1.0]:
			var t := -3.0 + i * 2.0
			b.box("stone_wall", Vector3(-88 + t, QUAY + 26.9, -37 + 3.85 * side), Vector3(0.9, 1.2, 0.5), 0.0, true)
			b.box("stone_wall", Vector3(-88 + 3.85 * side, QUAY + 26.9, -37 + t), Vector3(0.5, 1.2, 0.9), 0.0, true)
	for c in [Vector3(-91.6, 0, -40.6), Vector3(-84.4, 0, -40.6), Vector3(-91.6, 0, -33.4), Vector3(-84.4, 0, -33.4)]:
		b.box("stone_wall", c + Vector3(0, QUAY + 27.8, 0), Vector3(0.6, 2.2, 0.6), 0.0, true)
	for f in FACING.values():
		var n: Vector3 = f[0]
		b.box("glass", Vector3(-88, QUAY + 20.0, -37) + n * 4.02, Vector3(1.2, 3.0, 0.05), atan2(n.x, n.z), false, "", false)
	for i in 3:
		b.box("glass", Vector3(-80 + i * 5, QUAY + 4.5, -30.95), Vector3(1.4, 4.0, 0.05), 0.0, false, "", false)


func _bayards_cove() -> void:
	# Row of buildings facing the cobbled cove quay (fronts face east).
	house(-8, 4, 48, 58, 2, "wall_cream", "east", {"shop": "W. PENGELLY  ·  BAKER  ·  PASTIES", "fascia": "fascia_green"})
	b.box("stone_wall", BAKERY_SILL + Vector3(0.0, -0.06, 0), Vector3(0.5, 0.1, 1.6), 0.0, true)
	house(-8, 4, 58, 66, 3, "wall_pink", "east", {})
	# The Old Custom House (dated 1739) — in this story the Harbour Office.
	var ho := house(-8, 4, 66, 80, 3, "brick_wall", "east", {"door_key": "door_green", "roof_h": 4.2})
	b.box("lead", Vector3(4.2, ho + 0.05, 73.0), Vector3(0.45, 0.2, 14.6), 0.0, true)
	b.box("stone_wall", Vector3(-2.0, ho + 3.9, 78.5), Vector3(1.4, 3.0, 1.4), 0.0, true)
	b.box("stone_wall", Vector3(-2.0, ho + 5.45, 78.5), Vector3(1.6, 0.15, 1.6), 0.0, true)
	sign_label("HARBOUR OFFICE", Vector3(4.12, QUAY + 3.4, 73.0), PI * 0.5, 0.6, Color(0.95, 0.92, 0.82))
	sign_label("КОМЕНДАТУРА ПОРТА  ·  PORT COMMANDANT", Vector3(4.12, QUAY + 2.95, 73.0), PI * 0.5, 0.35, Color(0.9, 0.2, 0.15))
	house(-8, 4, 80, 92, 3, "wall_blue", "east", {})
	house(-8, 4, 92, 104, 2, "wall_white", "east", {})
	house(-20, -8, 48, 104, 3, "wall_grey", "east", {"chimneys": false, "door": false})
	# The courier's table outside the Harbour Office.
	b.box("wood", COVE_TABLE + Vector3(0, 0.78, 0), Vector3(1.0, 0.06, 1.6), 0.0, true)
	for c in [Vector3(-0.42, 0, -0.72), Vector3(0.42, 0, -0.72), Vector3(-0.42, 0, 0.72), Vector3(0.42, 0, 0.72)]:
		b.box("wood", COVE_TABLE + c + Vector3(0, 0.38, 0), Vector3(0.06, 0.76, 0.06), 0.0, false)
	# A courier's bicycle leaning on the wall.
	b.box("iron", COVE_TABLE + Vector3(-0.9, 0.55, 2.2), Vector3(0.05, 0.05, 1.1), 0.0, false)
	for dz in [-0.5, 0.5]:
		b.cylinder("iron", COVE_TABLE + Vector3(-0.9, 0.36, 2.2 + dz), 0.34, 0.04, 12, false)
	# The sentry's tea barrel.
	b.cylinder("wood", COVE_BARREL + Vector3(0, 0.45, 0), 0.32, 0.9, 10, true)
	# Iron water pump by the fort.
	b.cylinder("iron_green", COVE_PUMP + Vector3(0, 0.7, 0), 0.12, 1.4, 8, true)
	b.box("iron_green", COVE_PUMP + Vector3(0, 1.3, -0.3), Vector3(0.08, 0.08, 0.6), 0.0, false)
	b.box("stone_wall", COVE_PUMP + Vector3(0, 0.25, -0.75), Vector3(1.2, 0.5, 0.6), 0.0, true)
	# Field kitchen up the lane (tea urn under an awning).
	b.box("wood", COVE_KITCHEN + Vector3(0, 0.45, -1.2), Vector3(2.2, 0.9, 0.8), 0.0, true)
	b.cylinder("enamel", COVE_KITCHEN + Vector3(-0.5, 1.2, -1.2), 0.25, 0.6, 10, false)
	b.box("olive", COVE_KITCHEN + Vector3(0, 2.4, -1.0), Vector3(3.0, 0.08, 2.0), 0.0, false)
	for c in [Vector3(-1.4, 0, -1.9), Vector3(1.4, 0, -1.9), Vector3(-1.4, 0, -0.1), Vector3(1.4, 0, -0.1)]:
		b.box("wood", COVE_KITCHEN + c + Vector3(0, 1.2, 0), Vector3(0.08, 2.4, 0.08), 0.0, false)
	# Quay edge: bollards, lamp, railings.
	for z in [52.0, 60.0, 86.0, 94.0]:
		bollard(Vector3(31.2, QUAY, z))
	lamp_post(Vector3(30.5, QUAY, 64.0))
	# Bayard's Cove Fort: a low round artillery fort at the end of the quay.
	var fc := Vector3(20.0, QUAY, 112.0)
	var segs := 14
	for i in segs:
		var a0 := TAU * float(i) / segs
		if i == 11 or i == 10:
			continue
		var a1 := TAU * float(i + 1) / segs
		var p0 := fc + Vector3(cos(a0), 0, sin(a0)) * 7.0
		var p1 := fc + Vector3(cos(a1), 0, sin(a1)) * 7.0
		var mid := (p0 + p1) * 0.5
		var yaw := atan2(p1.x - p0.x, p1.z - p0.z)
		b.box("stone_wall", mid + Vector3(0, 1.85, 0), Vector3(1.6, 3.7, p0.distance_to(p1) + 0.4), yaw, true)
		if i % 3 == 0:
			b.box("glass", mid + Vector3(0, 1.2, 0) + (mid - fc).normalized() * 0.82, Vector3(0.5, 0.4, 0.05), atan2((mid - fc).x, (mid - fc).z), false, "", false)
	# Fishing boat moored off the cove (its mast is a perch).
	boat(Vector3(42, 0, 82), 0.0, 11.0, "hull_red", {"cabin": true, "mast": 9.0, "name": "BRIXHAM LASS"})


func _hillside() -> void:
	# The town climbs steeply to the west.
	b.ramp("hill", Vector3(-95, QUAY, -40), Vector3(-260, 64, -40), 520.0, 5.0)
	var rows := [-104.0, -122.0, -140.0, -160.0, -182.0]
	var colors := ["wall_white", "wall_cream", "wall_pink", "wall_blue", "wall_yellow", "wall_grey", "wall_green", "wall_ochre"]
	var k := 0
	for r in rows:
		var z := -150.0 + fmod(r * 7.0, 11.0)
		while z < 150.0:
			var w := 9.0 + fmod(absf(z * 1.7 + r), 6.0)
			var x0: float = r - 6.0
			var x1: float = r + 6.0
			var base := _hill_y(x1)
			if not (r < -170.0 and z < -125.0):
				house(x0, x1, z, z + w, 2 + (k % 2), colors[k % colors.size()], "east", {"base": base, "sink": 8.0, "chimneys": k % 3 == 0, "back_windows": false})
			k += 1
			z += w + 2.0 + float(k % 3)
	# Trees on the upper slopes.
	for i in 40:
		var tx := -200.0 - fmod(i * 37.0, 50.0)
		var tz := -240.0 + i * 12.0
		_tree(Vector3(tx, _hill_y(tx), tz), 3.5 + fmod(i * 1.3, 2.0))
	# The college on the hill — in this story the Soviet Kommandatura.
	var cy := _hill_y(-178.0)
	b.box("brick_wall", Vector3(-185, cy + 7, -175), Vector3(16, 22, 70), 0.0, true)
	b.gable_roof("slate", "brick_wall", Vector3(-185, cy + 18, -175), 70, 16, 4.0, PI * 0.5)
	b.box("wall_white", Vector3(-176.5, cy + 22, -175), Vector3(4, 22, 6), 0.0, true)
	b.hip_roof("lead", Vector3(-176.5, cy + 33, -175), 4, 6, 3.0)
	b.box("wall_white", Vector3(-176.3, cy + 28, -175), Vector3(4.2, 2.2, 2.2), 0.0, false)
	sign_label("КОМЕНДАТУРА", Vector3(-176.3 + 2.2, cy + 15.5, -175), PI * 0.5, 2.2, Color(0.9, 0.15, 0.1))
	_flag(Vector3(-176.5, cy + 36.0, -175), 7.0)
	# Royal Avenue Gardens.
	for p in [Vector3(-30, QUAY, -80), Vector3(-10, QUAY, -98), Vector3(4, QUAY, -106), Vector3(-35, QUAY, -105), Vector3(15, QUAY, -118)]:
		_tree(p, 4.5)
	_bandstand(Vector3(-8, QUAY, -78))
	b.box("paving", Vector3(-8, QUAY + 0.01, -70), Vector3(50, 0.02, 4), 0.0, false)


func _hill_y(x: float) -> float:
	return QUAY + (-95.0 - x) * (62.0 / 165.0)


func _tree(p: Vector3, size: float) -> void:
	b.cylinder("timber", p + Vector3(0, size * 0.5, 0), size * 0.08, size, 6, true)
	b.box("tree", p + Vector3(0, size * 1.2, 0), Vector3(size * 1.2, size * 1.0, size * 1.2), 0.6, true)
	b.box("tree_dark", p + Vector3(0, size * 1.55, 0), Vector3(size * 0.8, size * 0.6, size * 0.8), 0.1, false)


func _bandstand(p: Vector3) -> void:
	# Approximation: an octagonal Victorian-style bandstand (not verified).
	b.cylinder("stone_wall", p + Vector3(0, 0.4, 0), 4.0, 0.8, 8, true)
	for i in 8:
		var a := TAU * i / 8.0
		b.box("iron_green", p + Vector3(cos(a) * 3.6, 2.4, sin(a) * 3.6), Vector3(0.14, 3.2, 0.14), 0.0, false)
	b.cylinder("lead", p + Vector3(0, 4.4, 0), 4.3, 1.2, 8, true, 0.3)


func _kingswear() -> void:
	# Kingswear on the east bank: station by the water, houses climbing the hill.
	_land_box(186, 232, -260, 260, 2.5, "setts")
	b.ramp("hill", Vector3(230, 2.5, 0), Vector3(400, 70, 0), 560.0, 5.0)
	# Station and train.
	house(206, 222, -40, 10, 1, "wall_cream", "west", {"hip": true, "roof_h": 2.2, "chimneys": false, "base": 2.5})
	sign_label("KINGSWEAR", Vector3(205.9, 7.0, -15.0), -PI * 0.5, 1.6)
	for i in 4:
		b.box("hull_green", Vector3(226, 4.3, -55 + i * 21), Vector3(3.0, 3.4, 20), 0.0, true, "lead")
		for k in 6:
			b.box("glass", Vector3(224.45, 4.7, -63 + i * 21 + k * 3.2), Vector3(0.05, 1.0, 1.8), 0.0, false, "", false)
	# Lower Ferry slip and passenger pontoon (Kingswear side).
	b.ramp("setts", Vector3(186, 2.5, 45), Vector3(170, -1.0, 45), 9.0, 0.6)
	b.box("wood", Vector3(180, 0.45, -10), Vector3(12, 0.7, 6), 0.0, true, "deck")
	var colors := ["wall_white", "wall_pink", "wall_yellow", "wall_blue", "wall_cream", "wall_green"]
	var k := 0
	for r in [240.0, 258.0, 278.0, 300.0, 325.0]:
		var z := -200.0 + fmod(r * 3.0, 13.0)
		while z < 200.0:
			var w := 8.0 + fmod(absf(z * 1.3 + r), 6.0)
			var base: float = 2.5 + (r - 6.0 - 230.0) * (67.5 / 170.0)
			house(r - 6.0, r + 6.0, z, z + w, 2 + (k % 2), colors[k % colors.size()], "west", {"base": base, "sink": 8.0, "chimneys": k % 2 == 0, "back_windows": false})
			k += 1
			z += w + 3.0 + float(k % 4)
	# St Thomas' church tower, Kingswear (simplified).
	var ty := 2.5 + (262.0 - 230.0) * (67.5 / 170.0)
	b.box("stone_wall", Vector3(262, ty + 9, -30), Vector3(6, 18, 6), 0.0, true)
	for i in 4:
		b.box("stone_wall", Vector3(259.5 + i * 1.66, ty + 18.6, -32.8), Vector3(0.7, 1.2, 0.5), 0.0, true)
	for i in 30:
		var tx := 345.0 + fmod(i * 29.0, 40.0)
		_tree(Vector3(tx, 2.5 + (tx - 230.0) * (67.5 / 170.0), -230.0 + i * 16.0), 4.0)


func _harbour_mouth() -> void:
	# Headland to the south-west with the castle at the harbour mouth.
	_land_box(-200, -10, 160, 420, 14.0, "hill", "rock")
	_land_box(-10, 25, 280, 330, 6.0, "rock", "rock")
	b.cylinder("stone_wall", Vector3(8, 12, 305), 7.0, 12.0, 14, true)
	b.box("stone_wall", Vector3(-4, 10, 305), Vector3(12, 8, 12), 0.0, true)
	b.box("stone_wall", Vector3(-14, 17, 305), Vector3(6, 22, 6), 0.0, true)
	b.gable_roof("slate_old", "stone_wall", Vector3(-4, 14, 305), 12, 12, 4.0)
	# Kingswear Castle opposite.
	_land_box(232, 320, 260, 420, 10.0, "hill", "rock")
	b.box("stone_wall", Vector3(238, 13, 300), Vector3(10, 10, 12), 0.0, true)


func _river_boats() -> void:
	boat(Vector3(70, 0, -40), 0.2, 9.0, "hull_white", {"mast": 11.0})
	boat(Vector3(95, 0, -70), -0.3, 8.0, "hull_blue", {"mast": 10.0})
	boat(Vector3(85, 0, 25), 0.1, 10.0, "hull_white", {"mast": 12.0})
	boat(Vector3(120, 0, -15), 0.4, 7.0, "hull_green", {"mast": 9.0})
	boat(Vector3(110, 0, 60), -0.2, 12.0, "hull_black", {"cabin": true, "mast": 8.0})
	boat(Vector3(140, 0, -100), 0.0, 9.0, "hull_white", {"mast": 11.0})
	# Soviet patrol boat alongside the Embankment.
	boat(Vector3(41, 0, -80), 0.0, 22.0, "hull_grey", {"cabin": true, "patrol": true, "name": "ПК-117"})
	# Moorings.
	for p in [Vector3(75, 0, -110), Vector3(100, 0, 100), Vector3(60, 0, 50)]:
		b.cylinder("gpo_red", p + Vector3(0, 0.3, 0), 0.5, 0.8, 8, false)


## A moored boat. Bow points along local -Z rotated by `yaw`.
func boat(pos: Vector3, yaw: float, length: float, hull_key: String, o := {}) -> void:
	var r := Basis(Vector3.UP, yaw)
	var beam := length * (0.42 if o.get("dinghy", false) else 0.33)
	var depth := 0.9 if o.get("dinghy", false) else length * 0.14
	var free := 0.45 if o.get("dinghy", false) else 0.9
	# Hull body + tapered bow.
	b.box_basis(hull_key, pos + r * Vector3(0, free - depth * 0.5, length * 0.08), Vector3(beam, depth, length * 0.84), r, true, "deck")
	b.box_basis("antifoul", pos + r * Vector3(0, -0.05, length * 0.08), Vector3(beam * 0.98, 0.25, length * 0.82), r, false)
	var bow_basis := r * Basis(Vector3.UP, PI * 0.25)
	b.box_basis(hull_key, pos + r * Vector3(0, free - depth * 0.5, -length * 0.34), Vector3(beam * 0.71, depth, beam * 0.71), bow_basis, true, "deck")
	if o.get("cabin", false):
		var ck := "hull_grey" if o.get("patrol", false) else "hull_white"
		b.box_basis(ck, pos + r * Vector3(0, free + 0.9, -length * 0.05), Vector3(beam * 0.6, 1.8, length * 0.25), r, true, "wood")
		b.box_basis("glass", pos + r * Vector3(0, free + 1.3, -length * 0.05 - length * 0.126), Vector3(beam * 0.5, 0.6, 0.04), r, false)
	if o.get("mast", 0.0) > 0.0:
		var mh: float = o["mast"]
		var mp := pos + r * Vector3(0, free + mh * 0.5, -length * 0.15)
		b.cylinder("wood_light" if hull_key != "hull_grey" else "hull_grey", mp, 0.08, mh, 6, true, 0.05)
		b.box_basis("wood_light", pos + r * Vector3(0, free + mh - 0.02, -length * 0.15), Vector3(1.0, 0.12, 0.3), r, true)
	if o.get("pots", false):
		for i in 3:
			b.cylinder("wood", pos + r * Vector3(-beam * 0.25 + i * 0.05, free + 0.25, length * 0.28 - i * 0.7), 0.3, 0.5, 8, false)
	if o.get("patrol", false):
		b.box_basis("hull_grey", pos + r * Vector3(0, free + 2.6, length * 0.0), Vector3(1.0, 1.6, 1.0), r, false)
		b.box_basis("soviet_red", pos + r * Vector3(beam * 0.51, free - 0.3, -length * 0.25), Vector3(0.04, 0.6, 0.6), r, false)
	if o.has("name"):
		var stern := pos + r * Vector3(0, free - depth * 0.35, length * 0.5 + 0.03)
		sign_label(str(o["name"]), stern, yaw, 0.32, Color(0.95, 0.92, 0.85))


# --------------------------------------------------------------------------
# Ferries, flags, gulls, occupation dressing
# --------------------------------------------------------------------------

func _ferries() -> void:
	# Lower Ferry: a vehicle float pushed across by a tug.
	var lf := Ferry.new()
	lf.name = "LowerFerry"
	lf.point_a = Vector3(62, 0.0, 42)
	lf.point_b = Vector3(164, 0.0, 46)
	lf.travel_speed = 3.2
	lf.wait_time = 22.0
	lf.turns = false
	lf.wake_parent = wake_root
	lf.phase = 0.3
	add_child(lf)
	var fb := Builder.new(lf, "FloatMesh", lf)
	fb.box("hull_black", Vector3(0, 0.5, 0), Vector3(8, 1.0, 20), 0.0, true, "tarmac")
	for s in [-1.0, 1.0]:
		fb.box("hull_white", Vector3(3.9 * s, 1.4, 0), Vector3(0.12, 0.8, 18), 0.0, true)
	fb.box("hull_white", Vector3(0, 1.4, 9.5), Vector3(8, 0.8, 0.12), 0.0, false)
	_car(fb, Vector3(-1.8, 1.0, -4), "morris", Color(0.70, 0.78, 0.82))
	_car(fb, Vector3(1.8, 1.0, 2), "anglia", Color(0.85, 0.80, 0.55))
	# The tug, lashed alongside.
	fb.box("hull_blue", Vector3(6.2, 0.6, 2), Vector3(3.2, 1.6, 7.0), 0.0, true, "deck")
	fb.box("hull_white", Vector3(6.2, 2.1, 2.5), Vector3(2.2, 1.6, 2.6), 0.0, true, "lead")
	fb.cylinder("hull_black", Vector3(6.2, 3.3, 3.6), 0.3, 1.2, 8, false)
	fb.commit()
	var lbl := Label3D.new()
	lbl.text = "LOWER FERRY"
	lbl.font_size = 64
	lbl.pixel_size = 0.004
	lbl.position = Vector3(-4.1, 1.4, 0)
	lbl.rotation = Vector3(0, -PI * 0.5, 0)
	lf.add_child(lbl)
	ferries.append(lf)
	# Passenger ferry to Kingswear station.
	var pf := Ferry.new()
	pf.name = "PassengerFerry"
	pf.point_a = Vector3(60, 0.0, -4)
	pf.point_b = Vector3(170, 0.0, -10)
	pf.travel_speed = 4.0
	pf.wait_time = 18.0
	pf.wake_parent = wake_root
	pf.phase = 0.0
	add_child(pf)
	var pb := Builder.new(pf, "PFMesh", pf)
	pb.box("hull_black", Vector3(0, 0.6, 0), Vector3(4.6, 1.4, 15), 0.0, true, "deck")
	pb.box("hull_white", Vector3(0, 1.45, 0), Vector3(4.7, 0.3, 15.1), 0.0, false)
	pb.box("hull_white", Vector3(0, 2.3, 1.5), Vector3(3.6, 1.6, 7.0), 0.0, true, "lead")
	for k in 4:
		pb.box("glass", Vector3(1.82, 2.4, -0.8 + k * 1.6), Vector3(0.04, 0.8, 1.1), 0.0, false)
		pb.box("glass", Vector3(-1.82, 2.4, -0.8 + k * 1.6), Vector3(0.04, 0.8, 1.1), 0.0, false)
	pb.box("hull_white", Vector3(0, 3.5, -1.0), Vector3(1.6, 0.9, 1.6), 0.0, true, "lead")
	pb.cylinder("hull_black", Vector3(0, 4.2, 2.2), 0.25, 1.0, 8, false)
	pb.commit()
	ferries.append(pf)


func _car(fb: Builder, p: Vector3, style: String, c: Color) -> void:
	var key := "car_" + c.to_html()
	if not Pal._cache.has(key):
		Pal._cache[key] = Pal.col(c, 0.35)
	match style:
		"morris":
			fb.box(key, p + Vector3(0, 0.55, 0), Vector3(1.5, 0.75, 3.7), 0.0, false)
			fb.box(key, p + Vector3(0, 1.15, 0.2), Vector3(1.3, 0.6, 1.9), 0.0, false)
			fb.box("glass", p + Vector3(0, 1.15, -0.76), Vector3(1.2, 0.45, 0.04), 0.0, false)
		"anglia":
			fb.box(key, p + Vector3(0, 0.55, 0), Vector3(1.5, 0.7, 3.9), 0.0, false)
			fb.box(key, p + Vector3(0, 1.1, 0.1), Vector3(1.4, 0.55, 1.7), 0.0, false)
			fb.box("glass", p + Vector3(0, 1.1, -0.76), Vector3(1.3, 0.4, 0.04), 0.0, false)
		"gaz":
			fb.box("olive", p + Vector3(0, 0.75, 0), Vector3(1.75, 0.9, 3.8), 0.0, true)
			fb.box("canvas", p + Vector3(0, 1.55, 0.6), Vector3(1.7, 0.75, 2.0), 0.0, false)
			fb.box("glass", p + Vector3(0, 1.45, -0.45), Vector3(1.5, 0.5, 0.04), 0.0, false)
			fb.box("soviet_red", p + Vector3(0.88, 0.85, -1.0), Vector3(0.02, 0.3, 0.3), 0.0, false)
		"truck":
			fb.box("olive", p + Vector3(0, 1.3, -2.2), Vector3(2.3, 1.8, 2.0), 0.0, true)
			fb.box("olive_dark", p + Vector3(0, 1.0, 0.0), Vector3(2.3, 0.4, 6.0), 0.0, true)
			fb.box("canvas", p + Vector3(0, 2.2, 1.0), Vector3(2.4, 2.0, 4.2), 0.0, true)
	for s in [-1.0, 1.0]:
		for z in [-1.1, 1.1]:
			fb.cylinder("iron", p + Vector3(0.7 * s, 0.32, z), 0.32, 0.25, 8, false)


func car(p: Vector3, style: String, c: Color, yaw := 0.0) -> void:
	var holder := Node3D.new()
	holder.position = p
	holder.rotation.y = yaw
	props_root.add_child(holder)
	var cb := Builder.new(holder, "Car")
	_car(cb, Vector3.ZERO, style, c)
	cb.commit()


func _flag(top: Vector3, pole_h: float) -> void:
	b.cylinder("rail_white", top + Vector3(0, -pole_h * 0.5, 0), 0.06, pole_h, 6, false)
	var mi := MeshInstance3D.new()
	var qm := QuadMesh.new()
	qm.size = Vector2(2.6, 1.6)
	qm.subdivide_width = 10
	mi.mesh = qm
	mi.material_override = Pal.mat("flag_red")
	mi.position = top + Vector3(1.35, -0.85, 0)
	props_root.add_child(mi)
	var star := MeshInstance3D.new()
	var sb := BoxMesh.new()
	sb.size = Vector3(0.22, 0.22, 0.02)
	star.mesh = sb
	star.material_override = Pal.mat("star_gold")
	star.position = top + Vector3(0.45, -0.35, 0.02)
	star.rotation = Vector3(0, 0, PI * 0.25)
	props_root.add_child(star)


func _occupation() -> void:
	var level := int(opts.get("occupation", 1))
	# Notices pasted on walls.
	sign_label("NOTICE\nBY ORDER OF THE KOMMANDATURA\nCURFEW 21.00 HRS", Vector3(22.08, QUAY + 2.0, -13.0), PI * 0.5, 0.32, Color(0.1, 0.1, 0.1), false)
	b.box("paper", Vector3(22.04, QUAY + 2.0, -13.0), Vector3(0.02, 1.2, 1.6), 0.0, false)
	sign_label("THE FEEDING OF GULLS\nIS STRICTLY PROHIBITED\nКОРМИТЬ ЧАЕК ЗАПРЕЩЕНО", Vector3(4.06, QUAY + 2.0, 61.0), PI * 0.5, 0.3, Color(0.1, 0.1, 0.1), false)
	b.box("paper", Vector3(4.03, QUAY + 2.0, 61.0), Vector3(0.02, 1.2, 1.9), 0.0, false)
	sign_label("NOTICE\nGATHERINGS OF MORE THAN\nTHREE PERSONS ARE FORBIDDEN", Vector3(-39.6, QUAY + 2.0, -22.0), PI * 0.5, 0.3, Color(0.1, 0.1, 0.1), false)
	b.box("paper", Vector3(-39.58, QUAY + 2.0, -22.0), Vector3(0.02, 1.2, 1.9), 0.0, false)
	# Checkpoint on the Embankment.
	for x in [23.0, 34.0]:
		b.box("sandbag", Vector3(x, QUAY + 0.5, 34.0), Vector3(1.6, 1.0, 1.2), 0.0, true)
	b.box("barrier", Vector3(28.5, QUAY + 1.0, 34.0), Vector3(9.0, 0.15, 0.15), 0.0, false)
	for i in 5:
		b.box("soviet_red", Vector3(25.0 + i * 1.8, QUAY + 1.0, 34.0), Vector3(0.9, 0.17, 0.17), 0.0, false)
	b.box("olive", Vector3(23.4, QUAY + 1.3, 37.0), Vector3(1.4, 2.6, 1.4), 0.0, true)
	b.hip_roof("olive_dark", Vector3(23.4, QUAY + 2.6, 37.0), 1.6, 1.6, 0.6)
	# Sandbags at the fort.
	for i in 4:
		b.box("sandbag", Vector3(13.0 + i * 1.3, QUAY + 0.35, 104.0), Vector3(1.2, 0.7, 0.8), 0.0, true)
	# Vehicles.
	car(Vector3(27.0, QUAY, 16.0), "gaz", Color.WHITE, 0.0)
	car(Vector3(25.0, QUAY, -62.0), "morris", Color(0.15, 0.25, 0.20), PI)
	car(Vector3(-30.0, QUAY, -24.0), "anglia", Color(0.75, 0.25, 0.2), PI * 0.5)
	if level >= 2:
		car(Vector3(26.0, QUAY, -95.0), "truck", Color.WHITE, 0.0)
		car(Vector3(-28.0, QUAY, -40.0), "gaz", Color.WHITE, 0.0)


func _ambient_gulls() -> void:
	var specs := [
		[Vector3(60, 0, -20), 40.0, 34.0, 0.18],
		[Vector3(20, 0, 60), 25.0, 28.0, -0.22],
		[Vector3(-20, 0, -50), 30.0, 40.0, 0.15],
		[Vector3(120, 0, 30), 50.0, 45.0, -0.12],
		[Vector3(-60, 0, 0), 35.0, 52.0, 0.14],
	]
	for s in specs:
		var g := AmbientGull.new()
		g.center = s[0]
		g.radius = s[1]
		g.height = s[2]
		g.speed = s[3]
		props_root.add_child(g)
	for p in [Vector3(-34, 14.0, -15), Vector3(16, 13.6, 7), Vector3(-8, 13.2, 30), Vector3(-70, 15.6, 0), Vector3(-2, 14.2, 90), Vector3(35.2, 7.25, -65)]:
		var pg := AmbientGull.new()
		pg.perched = true
		pg.center = p
		props_root.add_child(pg)
