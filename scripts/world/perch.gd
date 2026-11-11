extends Node3D
## A designated perch: a good scouting spot that landing assist can glide onto.

const Pal = preload("res://scripts/world/palette.gd")

var perch_name := "Perch"
var hint := ""
var highlight := false
var radius := 1.4
var _ring: MeshInstance3D
var _t := 0.0


func _ready() -> void:
	_ring = MeshInstance3D.new()
	var torus := TorusMesh.new()
	torus.inner_radius = 0.45
	torus.outer_radius = 0.55
	torus.rings = 24
	torus.ring_segments = 4
	_ring.mesh = torus
	_ring.material_override = Pal.mat("marker_ring")
	_ring.scale = Vector3(1, 0.2, 1)
	_ring.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_ring.position = Vector3(0, 0.05, 0)
	add_child(_ring)


func _process(delta: float) -> void:
	_t += delta
	_ring.visible = highlight
	if highlight:
		var s := 1.0 + 0.15 * sin(_t * 4.0)
		_ring.scale = Vector3(s, 0.2, s)
