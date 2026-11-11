extends AnimatableBody3D
## A boat that shuttles between two points (the Lower Ferry float and its tug,
## or the passenger ferry). It is a moving platform: a gull can ride it.

const Pal = preload("res://scripts/world/palette.gd")

var point_a := Vector3.ZERO
var point_b := Vector3.ZERO
var travel_speed := 3.0
var wait_time := 20.0
var turns := true
var phase := 0.0
var _yaw := 0.0
var _t := 0.0
var _leg := 0
var _waiting := 0.0
var _wake_timer := 0.0
var _pos := 0.0
var _visual: Node3D
var wake_parent: Node3D = null


func _ready() -> void:
	sync_to_physics = true
	collision_layer = 1
	collision_mask = 0
	_waiting = phase * wait_time
	global_position = point_a
	var d := point_b - point_a
	_yaw = atan2(-d.x, -d.z)
	rotation.y = _yaw


func _physics_process(delta: float) -> void:
	var a := point_a if _leg == 0 else point_b
	var b := point_b if _leg == 0 else point_a
	var dist := a.distance_to(b)
	var dir := (b - a).normalized()
	if _waiting > 0.0:
		_waiting -= delta
		global_position = a + Vector3(0, sin(Time.get_ticks_msec() * 0.0015) * 0.05, 0)
		if turns:
			rotation.y = lerp_angle(rotation.y, atan2(-dir.x, -dir.z), 1.0 - exp(-0.6 * delta))
		return
	_pos += travel_speed * delta / maxf(dist, 1.0)
	var k := clampf(_pos, 0.0, 1.0)
	var eased := k * k * (3.0 - 2.0 * k)
	var p := a.lerp(b, eased)
	p.y = a.y + sin(Time.get_ticks_msec() * 0.0015) * 0.05
	global_position = p
	if turns:
		rotation.y = lerp_angle(rotation.y, atan2(-dir.x, -dir.z), 1.0 - exp(-2.0 * delta))
	else:
		rotation.y = _yaw
	_wake_timer -= delta
	if _wake_timer <= 0.0 and k > 0.05 and k < 0.95 and wake_parent != null:
		_wake_timer = 0.3
		_spawn_wake(global_position - dir * 6.0)
	if _pos >= 1.0:
		_pos = 0.0
		_leg = 1 - _leg
		_waiting = wait_time


func _spawn_wake(at: Vector3) -> void:
	var w := MeshInstance3D.new()
	var disc := CylinderMesh.new()
	disc.top_radius = 1.0
	disc.bottom_radius = 1.0
	disc.height = 0.02
	disc.radial_segments = 14
	w.mesh = disc
	var mat := Pal.unshaded(Color(0.9, 0.95, 0.95, 0.5)).duplicate() as StandardMaterial3D
	w.material_override = mat
	w.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	wake_parent.add_child(w)
	w.global_position = Vector3(at.x, 0.08, at.z)
	w.scale = Vector3(1.4, 1, 1.0)
	var tw := w.create_tween()
	tw.set_parallel(true)
	tw.tween_property(w, "scale", Vector3(6.5, 1, 4.0), 5.0)
	tw.tween_property(mat, "albedo_color:a", 0.0, 5.0)
	tw.chain().tween_callback(w.queue_free)
