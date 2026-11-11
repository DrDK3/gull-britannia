extends Node3D
## Where a gull deposits something: a Resistance drop or the food stash (nest).

const Pal = preload("res://scripts/world/palette.gd")

var point_id := "drop"
var label := "Drop point"
## "mission" accepts mission items, "food" accepts snacks. Or list kinds.
var accepts: Array = ["mission"]
var radius := 2.4
var style := "lobster_pot"
var highlight := false
var deposited: Array = []
var _flag: Node3D
var _t := 0.0


func accepts_item(item: Node3D) -> bool:
	if item == null:
		return false
	if item.kind in accepts:
		return true
	if item.is_mission and "mission" in accepts:
		return true
	if item.is_food and "food" in accepts:
		return true
	return false


func _ready() -> void:
	match style:
		"lobster_pot":
			_build_pot()
		"nest":
			_build_nest()
		_:
			pass
	_flag = Node3D.new()
	add_child(_flag)
	var pole := MeshInstance3D.new()
	var cm := CylinderMesh.new()
	cm.top_radius = 0.02
	cm.bottom_radius = 0.02
	cm.height = 1.2
	pole.mesh = cm
	pole.material_override = Pal.mat("wood")
	pole.position = Vector3(0.35, 0.6, 0)
	_flag.add_child(pole)
	var cloth := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = Vector3(0.35, 0.22, 0.01)
	cloth.mesh = bm
	cloth.material_override = Pal.col(Color(0.9, 0.85, 0.2) if style == "nest" else Color(0.85, 0.15, 0.1))
	cloth.position = Vector3(0.53, 1.08, 0)
	_flag.add_child(cloth)
	_flag.visible = false


func _build_pot() -> void:
	# A traditional Devon withy-style pot, approximated: domed frame on a base.
	var base := MeshInstance3D.new()
	var bm := CylinderMesh.new()
	bm.top_radius = 0.42
	bm.bottom_radius = 0.45
	bm.height = 0.12
	base.mesh = bm
	base.material_override = Pal.mat("wood")
	base.position = Vector3(0, 0.06, 0)
	add_child(base)
	var dome := MeshInstance3D.new()
	var sm := SphereMesh.new()
	sm.radius = 0.42
	sm.height = 0.84
	sm.is_hemisphere = true
	sm.radial_segments = 10
	sm.rings = 4
	dome.mesh = sm
	var mat := Pal.col(Color(0.55, 0.42, 0.26)).duplicate() as StandardMaterial3D
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.albedo_color = Color(0.55, 0.42, 0.26, 0.75)
	dome.material_override = mat
	dome.position = Vector3(0, 0.12, 0)
	dome.scale = Vector3(1, 0.85, 1)
	add_child(dome)
	var neck := MeshInstance3D.new()
	var tm := TorusMesh.new()
	tm.inner_radius = 0.1
	tm.outer_radius = 0.15
	neck.mesh = tm
	neck.material_override = Pal.mat("rope")
	neck.position = Vector3(0, 0.48, 0)
	add_child(neck)


func _build_nest() -> void:
	var ring := MeshInstance3D.new()
	var tm := TorusMesh.new()
	tm.inner_radius = 0.18
	tm.outer_radius = 0.42
	ring.mesh = tm
	ring.material_override = Pal.col(Color(0.52, 0.45, 0.30))
	ring.scale = Vector3(1, 0.6, 1)
	ring.position = Vector3(0, 0.08, 0)
	add_child(ring)
	var bed := MeshInstance3D.new()
	var cm := CylinderMesh.new()
	cm.top_radius = 0.25
	cm.bottom_radius = 0.2
	cm.height = 0.05
	bed.mesh = cm
	bed.material_override = Pal.col(Color(0.62, 0.55, 0.38))
	bed.position = Vector3(0, 0.04, 0)
	add_child(bed)


## Visual record of what was deposited.
func show_deposit(item: Node3D) -> void:
	deposited.append(item.kind)
	item.deliver_to(global_position + Vector3(randf_range(-0.12, 0.12), 0.15 + 0.03 * deposited.size(), randf_range(-0.12, 0.12)))
	if style == "lobster_pot":
		_flag.visible = true


func _process(delta: float) -> void:
	_t += delta
	if highlight and not _flag.visible:
		_flag.visible = true
	if _flag.visible:
		_flag.rotation.y = sin(_t * 2.0) * 0.15
