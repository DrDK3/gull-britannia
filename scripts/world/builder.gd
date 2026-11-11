extends RefCounted
## Batches primitive geometry into one mesh per material and adds matching
## static collision. Coordinates are metres; UVs are in metres so the
## procedural shaders tile consistently.

const Pal = preload("res://scripts/world/palette.gd")

const LAYER_WORLD := 1
const LAYER_WATER := 16

var root: Node3D
var _surfaces: Dictionary = {}


var body_node: CollisionObject3D


func _init(parent: Node3D, node_name := "Static", use_body: CollisionObject3D = null) -> void:
	root = Node3D.new()
	root.name = node_name
	parent.add_child(root)
	if use_body != null:
		body_node = use_body
		return
	var sb := StaticBody3D.new()
	sb.name = "Collision"
	sb.collision_layer = LAYER_WORLD
	sb.collision_mask = 0
	root.add_child(sb)
	body_node = sb


func _st(key: String) -> SurfaceTool:
	if not _surfaces.has(key):
		var st := SurfaceTool.new()
		st.begin(Mesh.PRIMITIVE_TRIANGLES)
		_surfaces[key] = st
	return _surfaces[key]


## Adds one triangle whose front face points along `n` (Godot fronts are clockwise).
func tri(key: String, a: Vector3, b: Vector3, c: Vector3, n: Vector3, ua := Vector2.ZERO, ub := Vector2.ZERO, uc := Vector2.ZERO) -> void:
	var st := _st(key)
	if (b - a).cross(c - a).dot(n) > 0.0:
		var tmp := b
		b = c
		c = tmp
		var tu := ub
		ub = uc
		uc = tu
	st.set_normal(n)
	st.set_uv(ua)
	st.add_vertex(a)
	st.set_normal(n)
	st.set_uv(ub)
	st.add_vertex(b)
	st.set_normal(n)
	st.set_uv(uc)
	st.add_vertex(c)


func quad(key: String, a: Vector3, b: Vector3, c: Vector3, d: Vector3, n: Vector3, ua := Vector2(0, 0), ub := Vector2(1, 0), uc := Vector2(1, 1), ud := Vector2(0, 1)) -> void:
	tri(key, a, b, c, n, ua, ub, uc)
	tri(key, a, c, d, n, ua, uc, ud)


## Axis-aligned (optionally yawed) box. `top_key` overrides the top face material.
func box(key: String, center: Vector3, size: Vector3, yaw := 0.0, collide := true, top_key := "", bottom := true) -> void:
	var basis := Basis(Vector3.UP, yaw)
	box_basis(key, center, size, basis, collide, top_key, bottom)


func box_basis(key: String, center: Vector3, size: Vector3, basis: Basis, collide := true, top_key := "", bottom := true) -> void:
	var h := size * 0.5
	var ax := basis.x
	var ay := basis.y
	var az := basis.z
	var tk := top_key if top_key != "" else key
	# Each face: normal, two tangent axes (u, v) with half-extents.
	var faces := [
		[ax, az, ay, h.x, h.z, h.y, key],
		[-ax, -az, ay, h.x, h.z, h.y, key],
		[az, -ax, ay, h.z, h.x, h.y, key],
		[-az, ax, ay, h.z, h.x, h.y, key],
		[ay, ax, -az, h.y, h.x, h.z, tk],
	]
	if bottom:
		faces.append([-ay, ax, az, h.y, h.x, h.z, key])
	for f in faces:
		var n: Vector3 = f[0]
		var u: Vector3 = f[1]
		var v: Vector3 = f[2]
		var dn: float = f[3]
		var du: float = f[4]
		var dv: float = f[5]
		var k: String = f[6]
		var c := center + n * dn
		var a := c - u * du - v * dv
		var b := c + u * du - v * dv
		var cc := c + u * du + v * dv
		var d := c - u * du + v * dv
		# World-ish UVs so materials tile in metres.
		var u0 := 0.0
		var v0 := 0.0
		if absf(n.y) > 0.5:
			u0 = center.x
			v0 = center.z
		else:
			u0 = center.x + center.z
			v0 = center.y
		quad(k, a, b, cc, d, n,
			Vector2(u0 - du, v0 + dv), Vector2(u0 + du, v0 + dv),
			Vector2(u0 + du, v0 - dv), Vector2(u0 - du, v0 - dv))
	if collide:
		var cs := CollisionShape3D.new()
		var shape := BoxShape3D.new()
		shape.size = size
		cs.shape = shape
		cs.transform = Transform3D(basis, center)
		body_node.add_child(cs)


## Gabled roof. Ridge runs along local X (length). Base sits at `base` (centre of eaves).
func gable_roof(key: String, gable_key: String, base: Vector3, length: float, width: float, height: float, yaw := 0.0, overhang := 0.3, collide := true) -> void:
	var b := Basis(Vector3.UP, yaw)
	var hl := length * 0.5 + overhang
	var hw := width * 0.5 + overhang
	var p := func(x: float, y: float, z: float) -> Vector3: return base + b * Vector3(x, y, z)
	var e1a: Vector3 = p.call(-hl, 0.0, -hw)
	var e1b: Vector3 = p.call(hl, 0.0, -hw)
	var e2a: Vector3 = p.call(-hl, 0.0, hw)
	var e2b: Vector3 = p.call(hl, 0.0, hw)
	var ra: Vector3 = p.call(-hl, height, 0.0)
	var rb: Vector3 = p.call(hl, height, 0.0)
	var slope := sqrt(hw * hw + height * height)
	var n1 := (b * Vector3(0, hw, -height)).normalized()
	var n2 := (b * Vector3(0, hw, height)).normalized()
	var u0 := base.x + base.z
	quad(key, e1a, e1b, rb, ra, n1, Vector2(u0 - hl, slope), Vector2(u0 + hl, slope), Vector2(u0 + hl, 0), Vector2(u0 - hl, 0))
	quad(key, e2a, e2b, rb, ra, n2, Vector2(u0 - hl, slope), Vector2(u0 + hl, slope), Vector2(u0 + hl, 0), Vector2(u0 - hl, 0))
	# Underside (so overhangs read from below).
	quad(key, e1a, e1b, e2b, e2a, -(b * Vector3.UP))
	# Gable ends.
	var gl := length * 0.5
	var gw := width * 0.5
	var g1a: Vector3 = p.call(-gl, 0.0, -gw)
	var g1b: Vector3 = p.call(-gl, 0.0, gw)
	var g1c: Vector3 = p.call(-gl, height * (gw / hw), 0.0)
	var g2a: Vector3 = p.call(gl, 0.0, -gw)
	var g2b: Vector3 = p.call(gl, 0.0, gw)
	var g2c: Vector3 = p.call(gl, height * (gw / hw), 0.0)
	tri(gable_key, g1a, g1b, g1c, -(b * Vector3.RIGHT), Vector2(0, 0), Vector2(width, 0), Vector2(width * 0.5, -height))
	tri(gable_key, g2a, g2b, g2c, b * Vector3.RIGHT, Vector2(0, 0), Vector2(width, 0), Vector2(width * 0.5, -height))
	if collide:
		var cs := CollisionShape3D.new()
		var shape := ConvexPolygonShape3D.new()
		shape.points = PackedVector3Array([e1a, e1b, e2a, e2b, ra, rb])
		cs.shape = shape
		body_node.add_child(cs)


## Hipped/pyramid roof over a rectangle.
func hip_roof(key: String, base: Vector3, length: float, width: float, height: float, yaw := 0.0, overhang := 0.3, collide := true) -> void:
	var b := Basis(Vector3.UP, yaw)
	var hl := length * 0.5 + overhang
	var hw := width * 0.5 + overhang
	var ridge := maxf(hl - hw, 0.0)
	var c1 := base + b * Vector3(-hl, 0, -hw)
	var c2 := base + b * Vector3(hl, 0, -hw)
	var c3 := base + b * Vector3(hl, 0, hw)
	var c4 := base + b * Vector3(-hl, 0, hw)
	var r1 := base + b * Vector3(-ridge, height, 0)
	var r2 := base + b * Vector3(ridge, height, 0)
	var u0 := base.x + base.z
	quad(key, c1, c2, r2, r1, (b * Vector3(0, hw, -height)).normalized(), Vector2(u0 - hl, hw), Vector2(u0 + hl, hw), Vector2(u0 + ridge, 0), Vector2(u0 - ridge, 0))
	quad(key, c4, c3, r2, r1, (b * Vector3(0, hw, height)).normalized(), Vector2(u0 - hl, hw), Vector2(u0 + hl, hw), Vector2(u0 + ridge, 0), Vector2(u0 - ridge, 0))
	tri(key, c1, c4, r1, (b * Vector3(-height, hw, 0)).normalized(), Vector2(0, hw), Vector2(2 * hw, hw), Vector2(hw, 0))
	tri(key, c2, c3, r2, (b * Vector3(height, hw, 0)).normalized(), Vector2(0, hw), Vector2(2 * hw, hw), Vector2(hw, 0))
	quad(key, c1, c2, c3, c4, -(b * Vector3.UP))
	if collide:
		var cs := CollisionShape3D.new()
		var shape := ConvexPolygonShape3D.new()
		shape.points = PackedVector3Array([c1, c2, c3, c4, r1, r2])
		cs.shape = shape
		body_node.add_child(cs)


func cylinder(key: String, center: Vector3, radius: float, height: float, segments := 10, collide := true, top_radius := -1.0, caps := true) -> void:
	var tr := radius if top_radius < 0.0 else top_radius
	var y0 := center.y - height * 0.5
	var y1 := center.y + height * 0.5
	for i in segments:
		var a0 := TAU * float(i) / segments
		var a1 := TAU * float(i + 1) / segments
		var d0 := Vector3(cos(a0), 0, sin(a0))
		var d1 := Vector3(cos(a1), 0, sin(a1))
		var p0 := center + d0 * radius
		var p1 := center + d1 * radius
		p0.y = y0
		p1.y = y0
		var q0 := center + d0 * tr
		var q1 := center + d1 * tr
		q0.y = y1
		q1.y = y1
		var n := ((d0 + d1) * 0.5).normalized()
		var circ := TAU * radius
		quad(key, p0, p1, q1, q0, n, Vector2(circ * i / segments, height), Vector2(circ * (i + 1) / segments, height), Vector2(circ * (i + 1) / segments, 0), Vector2(circ * i / segments, 0))
		if caps:
			tri(key, Vector3(center.x, y1, center.z), q0, q1, Vector3.UP, Vector2(center.x, center.z), Vector2(q0.x, q0.z), Vector2(q1.x, q1.z))
	if collide:
		var cs := CollisionShape3D.new()
		var shape := CylinderShape3D.new()
		shape.radius = maxf(radius, tr)
		shape.height = height
		cs.shape = shape
		cs.position = center
		body_node.add_child(cs)


## Free-standing flat quad (signs, posters). Not collidable.
func panel(key: String, center: Vector3, width: float, height: float, normal: Vector3) -> void:
	var n := normal.normalized()
	var u := Vector3.UP.cross(n).normalized()
	if u.length() < 0.1:
		u = Vector3.RIGHT
	var v := n.cross(u).normalized()
	var hw := width * 0.5
	var hh := height * 0.5
	quad(key, center - u * hw - v * hh, center + u * hw - v * hh, center + u * hw + v * hh, center - u * hw + v * hh, n,
		Vector2(0, 1), Vector2(1, 1), Vector2(1, 0), Vector2(0, 0))


## A sloped ramp (e.g. slipway) from `a` (top) to `b` (bottom), both at centre-line.
func ramp(key: String, a: Vector3, b: Vector3, width: float, thickness := 0.6, collide := true) -> void:
	var dir := b - a
	var run := dir.length()
	var fwd := dir / run
	var side := fwd.cross(Vector3.UP).normalized()
	var up := side.cross(fwd).normalized()
	if up.y < 0.0:
		up = -up
		side = -side
	var basis := Basis(side, up, -fwd)
	box_basis(key, (a + b) * 0.5 - up * thickness * 0.5, Vector3(width, thickness, run), basis, collide)


## Finalises: one MeshInstance3D per material.
func commit() -> void:
	for key in _surfaces.keys():
		var st: SurfaceTool = _surfaces[key]
		var mesh := st.commit()
		var mi := MeshInstance3D.new()
		mi.name = "Mesh_" + str(key)
		mi.mesh = mesh
		mi.material_override = Pal.mat(key)
		root.add_child(mi)
	_surfaces.clear()
