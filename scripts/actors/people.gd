extends RefCounted
## Builds and animates simple primitive people (soldiers, officers, civilians).
## Proportions are slightly exaggerated so silhouettes read from a rooftop.

const Pal = preload("res://scripts/world/palette.gd")


static func _mesh(parent: Node3D, mesh: Mesh, mat: Material, pos: Vector3, rot := Vector3.ZERO, scl := Vector3.ONE) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = mat
	mi.position = pos
	mi.rotation = rot
	mi.scale = scl
	parent.add_child(mi)
	return mi


static func _box(size: Vector3) -> BoxMesh:
	var b := BoxMesh.new()
	b.size = size
	return b


static func _cap(radius: float, height: float) -> CapsuleMesh:
	var c := CapsuleMesh.new()
	c.radius = radius
	c.height = height
	c.radial_segments = 8
	c.rings = 2
	return c


static func _cyl(r: float, h: float, top := -1.0) -> CylinderMesh:
	var c := CylinderMesh.new()
	c.bottom_radius = r
	c.top_radius = r if top < 0.0 else top
	c.height = h
	c.radial_segments = 12
	return c


static func _sphere(r: float) -> SphereMesh:
	var s := SphereMesh.new()
	s.radius = r
	s.height = r * 2.0
	s.radial_segments = 12
	s.rings = 6
	return s


## Builds a figure under `parent`. Returns named parts for animation.
## style: "soldier", "officer", "commandant", "civilian", "fisherwoman", "clerk"
static func build(parent: Node3D, style := "soldier", opts := {}) -> Dictionary:
	var parts := {}
	var body := Node3D.new()
	body.name = "Body"
	parent.add_child(body)
	parts["body"] = body
	var coat_key := "olive"
	var trouser_key := "olive_dark"
	var cap_kind := "furazhka"
	var scale := float(opts.get("scale", 1.0))
	match style:
		"officer":
			coat_key = "khaki"
		"commandant":
			coat_key = "khaki"
			scale *= 1.08
		"civilian":
			coat_key = str(opts.get("coat", "tweed"))
			trouser_key = "tweed"
			cap_kind = "flatcap"
		"fisherwoman":
			coat_key = "navy"
			trouser_key = "navy"
			cap_kind = "headscarf"
		"clerk":
			coat_key = "olive"
			cap_kind = "pilotka"
	body.scale = Vector3.ONE * scale

	# Legs
	for side in [-1.0, 1.0]:
		var hip := Node3D.new()
		hip.position = Vector3(0.12 * side, 0.95, 0)
		body.add_child(hip)
		_mesh(hip, _cap(0.085, 0.9), Pal.mat(trouser_key), Vector3(0, -0.45, 0))
		_mesh(hip, _box(Vector3(0.15, 0.12, 0.27)), Pal.mat("boots"), Vector3(0, -0.9, -0.05))
		parts["leg_l" if side < 0 else "leg_r"] = hip

	# Torso and coat
	var torso := Node3D.new()
	torso.position = Vector3(0, 0.95, 0)
	body.add_child(torso)
	parts["torso"] = torso
	_mesh(torso, _box(Vector3(0.46, 0.6, 0.27)), Pal.mat(coat_key), Vector3(0, 0.3, 0))
	if style in ["soldier", "officer", "commandant", "clerk"]:
		_mesh(torso, _box(Vector3(0.5, 0.42, 0.31)), Pal.mat(coat_key), Vector3(0, -0.12, 0))
		_mesh(torso, _box(Vector3(0.48, 0.06, 0.3)), Pal.mat("belt"), Vector3(0, 0.06, 0))
		# Shoulder boards
		for side in [-1.0, 1.0]:
			_mesh(torso, _box(Vector3(0.12, 0.02, 0.1)), Pal.mat("cap_band" if style != "soldier" else "olive_dark"), Vector3(0.2 * side, 0.6, 0))
	elif style == "fisherwoman":
		_mesh(torso, _box(Vector3(0.5, 0.5, 0.31)), Pal.mat("navy"), Vector3(0, -0.15, 0))
	if style == "commandant":
		# Medals: a row of brave little rectangles.
		for i in 4:
			_mesh(torso, _box(Vector3(0.05, 0.03, 0.02)), Pal.mat(["soviet_red", "star_gold", "hull_blue", "wall_yellow"][i]), Vector3(-0.12 + i * 0.055, 0.45, -0.14))
	if style == "soldier" and bool(opts.get("rifle", true)):
		var rifle := _mesh(torso, _box(Vector3(0.05, 0.95, 0.06)), Pal.mat("timber"), Vector3(0.05, 0.32, 0.17), Vector3(0, 0, 0.45))
		parts["rifle"] = rifle
	if style in ["soldier", "clerk"]:
		_mesh(torso, _box(Vector3(0.1, 0.08, 0.3)), Pal.mat("soviet_red"), Vector3(-0.27, 0.42, 0))

	# Arms
	for side in [-1.0, 1.0]:
		var sh := Node3D.new()
		sh.position = Vector3(0.29 * side, 0.55, 0)
		torso.add_child(sh)
		_mesh(sh, _cap(0.07, 0.6), Pal.mat(coat_key), Vector3(0, -0.27, 0))
		var hand := _mesh(sh, _sphere(0.06), Pal.mat("skin"), Vector3(0, -0.58, 0))
		parts["arm_l" if side < 0 else "arm_r"] = sh
		parts["hand_l" if side < 0 else "hand_r"] = hand

	# Head
	var neck := Node3D.new()
	neck.position = Vector3(0, 0.62, 0)
	torso.add_child(neck)
	parts["head"] = neck
	_mesh(neck, _sphere(0.125), Pal.mat("skin"), Vector3(0, 0.12, 0), Vector3.ZERO, Vector3(1, 1.08, 1))
	_mesh(neck, _sphere(0.03), Pal.mat("skin"), Vector3(0, 0.1, -0.125))
	var hat := Node3D.new()
	hat.position = Vector3(0, 0.22, 0)
	neck.add_child(hat)
	parts["hat"] = hat
	match cap_kind:
		"furazhka":
			_mesh(hat, _cyl(0.13, 0.05), Pal.mat("cap_band"), Vector3(0, 0.0, 0))
			_mesh(hat, _cyl(0.19, 0.06, 0.16), Pal.mat("olive" if style == "soldier" else "khaki"), Vector3(0, 0.05, 0), Vector3(-0.08, 0, 0))
			_mesh(hat, _box(Vector3(0.2, 0.015, 0.1)), Pal.mat("visor"), Vector3(0, -0.02, -0.15), Vector3(0.25, 0, 0))
			_mesh(hat, _box(Vector3(0.035, 0.035, 0.01)), Pal.mat("star_gold"), Vector3(0, 0.03, -0.135))
			if style == "commandant":
				_mesh(hat, _cyl(0.24, 0.07, 0.2), Pal.mat("khaki"), Vector3(0, 0.08, 0), Vector3(-0.1, 0, 0))
		"pilotka":
			_mesh(hat, _box(Vector3(0.12, 0.08, 0.26)), Pal.mat("olive"), Vector3(0, -0.02, 0))
			_mesh(hat, _box(Vector3(0.03, 0.03, 0.01)), Pal.mat("soviet_red"), Vector3(0, 0.0, -0.135))
		"flatcap":
			_mesh(hat, _cyl(0.14, 0.05, 0.12), Pal.mat("tweed"), Vector3(0, -0.02, 0))
			_mesh(hat, _box(Vector3(0.2, 0.015, 0.12)), Pal.mat("tweed"), Vector3(0, -0.04, -0.13), Vector3(0.2, 0, 0))
		"headscarf":
			_mesh(hat, _sphere(0.14), Pal.mat(str(opts.get("scarf", "wall_pink"))), Vector3(0, -0.05, 0.02), Vector3.ZERO, Vector3(1.05, 0.9, 1.1))
	return parts


## Procedural animation. `phase` advances with walking; `t` is wall time.
static func animate(parts: Dictionary, anim: String, phase: float, moving: bool, running: bool, t: float, head_yaw := 0.0, head_pitch := 0.0) -> void:
	var leg_l: Node3D = parts["leg_l"]
	var leg_r: Node3D = parts["leg_r"]
	var arm_l: Node3D = parts["arm_l"]
	var arm_r: Node3D = parts["arm_r"]
	var head: Node3D = parts["head"]
	var torso: Node3D = parts["torso"]
	var swing := 0.0
	if moving:
		swing = sin(phase) * (0.75 if running else 0.45)
	leg_l.rotation = Vector3(swing, 0, 0)
	leg_r.rotation = Vector3(-swing, 0, 0)
	arm_l.rotation = Vector3(-swing * 0.8, 0, 0.05)
	arm_r.rotation = Vector3(swing * 0.8, 0, -0.05)
	torso.position.y = 0.95 + (absf(sin(phase)) * 0.04 if moving else sin(t * 1.6) * 0.004)
	torso.rotation = Vector3(0.12 if running else 0.0, 0, 0)
	var hp := head_pitch
	var hy := head_yaw
	match anim:
		"sip":
			arm_r.rotation = Vector3(-2.2, 0, -0.35)
			hp += 0.25
		"outrage":
			var shake := sin(t * 22.0) * 0.35
			arm_l.rotation = Vector3(-2.7 + shake, 0, 0.3)
			arm_r.rotation = Vector3(-2.7 - shake, 0, -0.3)
			hp += 0.5
			torso.position.y = 0.95 + absf(sin(t * 9.0)) * 0.12
		"scrub":
			var s := sin(t * 18.0)
			arm_l.rotation = Vector3(-1.2 + s * 0.3, 0.3, 0.6)
			arm_r.rotation = Vector3(-1.0 - s * 0.3, -0.3, -0.6)
			hp -= 0.45
			torso.rotation = Vector3(0.35, 0, 0)
		"look_around":
			hy += sin(t * 1.4) * 1.1
			hp += 0.25 + sin(t * 0.9) * 0.2
		"look_up":
			hp += 0.75
			hy += sin(t * 0.8) * 0.5
		"point":
			arm_r.rotation = Vector3(-1.5 - head_pitch * 0.6, 0, -0.1)
			hp += 0.15
		"shoo":
			var w := sin(t * 14.0)
			arm_r.rotation = Vector3(-2.4 + w * 0.6, 0, -0.2)
			arm_l.rotation = Vector3(-1.4 - w * 0.4, 0, 0.2)
		"throw":
			arm_r.rotation = Vector3(-2.9, 0, -0.2)
		"attention":
			arm_l.rotation = Vector3(0, 0, 0.05)
			arm_r.rotation = Vector3(0, 0, -0.05)
		"salute":
			arm_r.rotation = Vector3(-2.3, 0, -1.0)
		"read":
			arm_l.rotation = Vector3(-1.1, 0, 0.3)
			arm_r.rotation = Vector3(-1.1, 0, -0.3)
			hp -= 0.4
		"eat":
			arm_r.rotation = Vector3(-1.9 + sin(t * 3.0) * 0.4, 0, -0.3)
			hp -= 0.1
		"cower":
			arm_l.rotation = Vector3(-2.6, 0, 0.9)
			arm_r.rotation = Vector3(-2.6, 0, -0.9)
			hp -= 0.4
			torso.rotation = Vector3(0.5, 0, 0)
		"flail":
			arm_l.rotation = Vector3(-2.0 + sin(t * 17.0) * 1.0, 0, 0.8)
			arm_r.rotation = Vector3(-2.0 + cos(t * 15.0) * 1.0, 0, -0.8)
			hp += sin(t * 7.0) * 0.4
		"sit":
			leg_l.rotation = Vector3(-1.5, 0, 0)
			leg_r.rotation = Vector3(-1.5, 0, 0)
			torso.position.y = 0.5
		"whistle":
			arm_r.rotation = Vector3(-2.4, 0, -0.5)
			hp += 0.1
	head.rotation = Vector3(clampf(hp, -0.7, 0.9), clampf(hy, -1.4, 1.4), 0)
