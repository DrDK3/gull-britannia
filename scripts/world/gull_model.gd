extends Node3D
## A readable gull silhouette: white body, grey mantle, black wingtips with
## white mirrors, yellow beak. Used for ambient gulls and the allied flock.

const Pal = preload("res://scripts/world/palette.gd")

var flap_rate := 3.5
var flapping := true
var flap_amount := 1.0
var _t := 0.0
var _wing_l: Node3D
var _wing_r: Node3D
var _head: Node3D
var size := 1.0
var tint := Color(1, 1, 1)


func _ready() -> void:
	_t = randf() * 10.0
	scale = Vector3.ONE * size
	var body := MeshInstance3D.new()
	var bs := SphereMesh.new()
	bs.radius = 0.16
	bs.height = 0.32
	bs.radial_segments = 10
	bs.rings = 5
	body.mesh = bs
	body.material_override = Pal.mat("gull_white")
	body.scale = Vector3(0.8, 0.75, 1.9)
	add_child(body)
	var mantle := MeshInstance3D.new()
	var mb := BoxMesh.new()
	mb.size = Vector3(0.22, 0.04, 0.42)
	mantle.mesh = mb
	mantle.material_override = Pal.mat("gull_grey")
	mantle.position = Vector3(0, 0.1, 0.02)
	add_child(mantle)
	_head = Node3D.new()
	_head.position = Vector3(0, 0.1, -0.3)
	add_child(_head)
	var head := MeshInstance3D.new()
	var hs := SphereMesh.new()
	hs.radius = 0.085
	hs.height = 0.17
	head.mesh = hs
	head.material_override = Pal.mat("gull_white")
	_head.add_child(head)
	var beak := MeshInstance3D.new()
	var bc := CylinderMesh.new()
	bc.top_radius = 0.0
	bc.bottom_radius = 0.025
	bc.height = 0.12
	beak.mesh = bc
	beak.material_override = Pal.mat("beak")
	beak.rotation = Vector3(-PI * 0.5, 0, 0)
	beak.position = Vector3(0, -0.01, -0.12)
	_head.add_child(beak)
	var tail := MeshInstance3D.new()
	var tb := BoxMesh.new()
	tb.size = Vector3(0.16, 0.02, 0.16)
	tail.mesh = tb
	tail.material_override = Pal.mat("gull_white")
	tail.position = Vector3(0, 0.02, 0.36)
	add_child(tail)
	_wing_l = _wing(-1.0)
	_wing_r = _wing(1.0)


func _wing(side: float) -> Node3D:
	var pivot := Node3D.new()
	pivot.position = Vector3(0.1 * side, 0.08, -0.02)
	add_child(pivot)
	var inner := MeshInstance3D.new()
	var ib := BoxMesh.new()
	ib.size = Vector3(0.42, 0.025, 0.24)
	inner.mesh = ib
	inner.material_override = Pal.mat("gull_grey")
	inner.position = Vector3(0.21 * side, 0, 0)
	pivot.add_child(inner)
	var outer := MeshInstance3D.new()
	var ob := BoxMesh.new()
	ob.size = Vector3(0.3, 0.02, 0.16)
	outer.mesh = ob
	outer.material_override = Pal.mat("gull_grey")
	outer.position = Vector3(0.56 * side, 0, 0.03)
	pivot.add_child(outer)
	var tip := MeshInstance3D.new()
	var tbx := BoxMesh.new()
	tbx.size = Vector3(0.16, 0.022, 0.12)
	tip.mesh = tbx
	tip.material_override = Pal.mat("gull_black")
	tip.position = Vector3(0.76 * side, 0, 0.05)
	pivot.add_child(tip)
	var mirror := MeshInstance3D.new()
	var mm := BoxMesh.new()
	mm.size = Vector3(0.04, 0.024, 0.04)
	mirror.mesh = mm
	mirror.material_override = Pal.mat("gull_white")
	mirror.position = Vector3(0.8 * side, 0, 0.04)
	pivot.add_child(mirror)
	return pivot


func fold(on: bool) -> void:
	flapping = not on
	if on:
		_wing_l.rotation = Vector3(0, 0.15, 1.2)
		_wing_r.rotation = Vector3(0, -0.15, -1.2)
		_wing_l.scale = Vector3(0.35, 1, 1)
		_wing_r.scale = Vector3(0.35, 1, 1)
	else:
		_wing_l.scale = Vector3.ONE
		_wing_r.scale = Vector3.ONE


func _process(delta: float) -> void:
	_t += delta
	if flapping:
		var a := sin(_t * flap_rate * TAU) * 0.6 * flap_amount + 0.08
		_wing_l.rotation = Vector3(0, 0, a)
		_wing_r.rotation = Vector3(0, 0, -a)
	else:
		_head.rotation.y = sin(_t * 0.7) * 0.6 * (1.0 if fmod(_t, 7.0) < 4.0 else 0.0)
