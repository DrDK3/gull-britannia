extends Node3D
## A gull of the Bomber Wing. Roosts until signalled, then flies in a V on
## the player's wing, releases when the leader releases, circles the target
## once and returns to the roost to reload.

const GullModel = preload("res://scripts/world/gull_model.gd")

enum A { ROOST, FOLLOW, CIRCLE, RETURN }

var mission: Node = null
var callsign := "Gull"
var roost := Vector3.ZERO
var slot := Vector3(-2.5, -0.5, 2.5)
var state: int = A.ROOST
var reload_timer := 0.0
var velocity := Vector3.ZERO
var _model: Node3D
var _circle_center := Vector3.ZERO
var _circle_t := 0.0
var _release_queue: Array = []
var _drops_left := 0
var _t := 0.0


func _ready() -> void:
	_model = GullModel.new()
	_model.size = 1.15
	add_child(_model)
	global_position = roost
	_model.fold(true)
	_t = randf() * 5.0


func is_ready() -> bool:
	return state == A.ROOST and reload_timer <= 0.0


func scramble() -> void:
	state = A.FOLLOW
	_drops_left = 4
	_model.fold(false)
	_model.flapping = true
	velocity = Vector3.UP * 4.0


## Leader released: queue this gull's drops with a small stagger.
func release(delay: float) -> void:
	if state != A.FOLLOW or _drops_left <= 0:
		return
	_drops_left -= 2
	_release_queue.append(delay)
	_release_queue.append(delay + 0.16)


func _slot_position(leader: Node3D) -> Vector3:
	var f: Vector3 = leader.velocity
	f.y = 0.0
	if f.length() < 1.0:
		f = leader.flat_dir()
	f = f.normalized()
	var right := f.cross(Vector3.UP).normalized()
	return leader.global_position + right * slot.x + Vector3.UP * slot.y - f * slot.z


func break_off(center: Vector3) -> void:
	if state == A.FOLLOW:
		state = A.CIRCLE
		_circle_center = center
		_circle_t = 0.0


func _physics_process(delta: float) -> void:
	_t += delta
	if mission == null:
		return
	var leader: Node3D = mission.gull
	var desired := global_position
	match state:
		A.ROOST:
			reload_timer = maxf(reload_timer - delta, 0.0)
			global_position = roost
			rotation.y = lerp_angle(rotation.y, PI * 0.5 + sin(_t * 0.3) * 0.4, delta)
			return
		A.FOLLOW:
			desired = _slot_position(leader)
			for i in range(_release_queue.size() - 1, -1, -1):
				_release_queue[i] -= delta
				if _release_queue[i] <= 0.0:
					_release_queue.remove_at(i)
					var v: Vector3 = leader.velocity + Vector3(randf_range(-0.3, 0.3), -1.0, randf_range(-0.3, 0.3))
					mission.spawn_poop(global_position + Vector3(0, -0.2, 0), v, true)
					Sfx.play_at("poop", global_position, -8.0, randf_range(0.9, 1.2))
		A.CIRCLE:
			_circle_t += delta
			var a := _circle_t * 0.9 + slot.x
			desired = _circle_center + Vector3(cos(a) * 14.0, 22.0 + slot.y * 2.0, sin(a) * 14.0)
			if _circle_t > 6.0:
				state = A.RETURN
		A.RETURN:
			desired = roost + Vector3(0, 0.4, 0)
			if global_position.distance_to(roost) < 0.8:
				state = A.ROOST
				reload_timer = 14.0
				_model.fold(true)
				velocity = Vector3.ZERO
				return
	var to := desired - global_position
	var max_spd := 34.0 if state == A.FOLLOW else 16.0
	var want := to * 2.4
	if want.length() > max_spd:
		want = want.normalized() * max_spd
	velocity = velocity.lerp(want, 1.0 - exp(-4.0 * delta))
	global_position += velocity * delta
	var flat := Vector3(velocity.x, 0, velocity.z)
	if flat.length() > 0.5:
		var yaw := atan2(-flat.x, -flat.z)
		rotation.y = lerp_angle(rotation.y, yaw, 1.0 - exp(-6.0 * delta))
	_model.flapping = velocity.y > -1.0 or state != A.FOLLOW
