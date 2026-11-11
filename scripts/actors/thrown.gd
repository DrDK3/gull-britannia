extends Node3D
## A cap (or boot) thrown by an outraged soldier. Slow, visible, dodgeable.
## A hit knocks the gull into a tumble and it drops whatever it carries.

const Pal = preload("res://scripts/world/palette.gd")

var mission: Node = null
var velocity := Vector3.ZERO
var thrower: Node3D = null
var _life := 3.0
var _spin := 0.0
var _hit := false


func _ready() -> void:
	var crown := MeshInstance3D.new()
	var cm := CylinderMesh.new()
	cm.top_radius = 0.17
	cm.bottom_radius = 0.13
	cm.height = 0.07
	crown.mesh = cm
	crown.material_override = Pal.mat("olive")
	add_child(crown)
	var band := MeshInstance3D.new()
	var bm := CylinderMesh.new()
	bm.top_radius = 0.135
	bm.bottom_radius = 0.135
	bm.height = 0.04
	band.mesh = bm
	band.material_override = Pal.mat("cap_band")
	band.position = Vector3(0, -0.045, 0)
	add_child(band)


## Aims with a simple lead on the gull's velocity.
func launch(from: Vector3, gull: Node3D, spd := 15.0) -> void:
	global_position = from
	var gp: Vector3 = gull.global_position
	var t := from.distance_to(gp) / spd
	var aim: Vector3 = gp + gull.velocity * t * 0.6
	var d := aim - from
	velocity = d / maxf(t, 0.1)
	velocity.y += 0.5 * 9.8 * t
	_spin = 14.0


func _physics_process(delta: float) -> void:
	_life -= delta
	if _life <= 0.0 or _hit:
		queue_free()
		return
	var from := global_position
	velocity.y -= 9.8 * delta
	var to := from + velocity * delta
	rotation.y += _spin * delta
	rotation.x = sin(_life * 9.0) * 0.4
	var g: Node3D = mission.gull if mission else null
	if g != null:
		var closest := Geometry3D.get_closest_point_to_segment(g.global_position, from, to)
		if closest.distance_to(g.global_position) < 0.75:
			_hit = true
			mission.on_gull_hit_by_thrown(self)
			return
	var space := get_world_3d().direct_space_state
	var q := PhysicsRayQueryParameters3D.create(from, to, 1 | 16)
	var hit := space.intersect_ray(q)
	if not hit.is_empty():
		global_position = hit["position"]
		set_physics_process(false)
		var tw := create_tween()
		tw.tween_interval(4.0)
		tw.tween_callback(queue_free)
		return
	global_position = to
