extends Node3D
## A soldier on parade. Marches in formation, eyes front (a soldier on parade
## does not look up). Flinches when hit; scatters in chaos when the formation
## breaks; then shuffles back into line.

const People = preload("res://scripts/actors/people.gd")

enum M { MARCH, HALT, CHAOS, REFORM }

var slot := Vector3.ZERO
var state: int = M.MARCH
var target := Vector3.ZERO
var heading := 0.0
var ground_y := 2.0
var hits := 0
var parts: Dictionary = {}
var _phase := 0.0
var _t := 0.0
var _flinch := 0.0
var _chaos_target := Vector3.ZERO
var _chaos_timer := 0.0
var _anim := "attention"
var _bubble: Label3D
var _bubble_t := 0.0
var _cap_off := false
var _speed := 1.4

const CHAOS_LINES := ["My eyes!", "Medic!", "It's in my HAT!", "Air raid!", "Not the greatcoat!", "Mama!", "Gulls! GULLS!", "Which way is front?!"]


func _ready() -> void:
	parts = People.build(self, "soldier", {"rifle": true})
	_t = randf() * 3.0
	_bubble = Label3D.new()
	_bubble.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	_bubble.no_depth_test = true
	_bubble.font_size = 36
	_bubble.outline_size = 10
	_bubble.pixel_size = 0.0042
	_bubble.position = Vector3(0, 2.3, 0)
	_bubble.visible = false
	add_child(_bubble)


func say(text: String, dur := 2.2) -> void:
	_bubble.text = text
	_bubble.visible = true
	_bubble_t = dur


func on_hit() -> void:
	hits += 1
	_flinch = 1.2
	if state == M.MARCH and randf() < 0.6:
		say(["Ugh!", "Eyes front...", "Steady...", "Not now..."][randi() % 4], 1.6)


func start_chaos(center: Vector3, area: Rect2) -> void:
	state = M.CHAOS
	_chaos_timer = randf_range(0.0, 0.6)
	_pick_chaos_target(center, area)
	if randf() < 0.65:
		say(CHAOS_LINES[randi() % CHAOS_LINES.size()], 2.5)
	if randf() < 0.5 and not _cap_off:
		_cap_off = true
		var hat: Node3D = parts["hat"]
		var tw := create_tween()
		tw.tween_property(hat, "position", hat.position + Vector3(randf_range(-0.6, 0.6), 1.2, randf_range(-0.6, 0.6)), 0.35)
		tw.tween_property(hat, "position", hat.position + Vector3(randf_range(-1.2, 1.2), -1.95, randf_range(-1.2, 1.2)), 0.45)


func _pick_chaos_target(center: Vector3, area: Rect2) -> void:
	var p := center + Vector3(randf_range(-9, 9), 0, randf_range(-9, 9))
	p.x = clampf(p.x, area.position.x, area.end.x)
	p.z = clampf(p.z, area.position.y, area.end.y)
	_chaos_target = p


func reform() -> void:
	state = M.REFORM


func _process(delta: float) -> void:
	_t += delta
	if _bubble_t > 0.0:
		_bubble_t -= delta
		if _bubble_t <= 0.0:
			_bubble.visible = false
	_flinch = maxf(_flinch - delta, 0.0)
	var moving := false
	var running := false
	match state:
		M.MARCH, M.HALT:
			var d := Vector3(target.x - global_position.x, 0, target.z - global_position.z)
			var dist := d.length()
			if dist > 0.05:
				global_position += d.normalized() * minf(dist, maxf(_speed, dist * 2.0) * delta)
				moving = state == M.MARCH or dist > 0.3
			rotation.y = lerp_angle(rotation.y, heading, 1.0 - exp(-6.0 * delta))
			_anim = "flail" if _flinch > 0.6 else "attention"
		M.CHAOS:
			_chaos_timer -= delta
			var d2 := Vector3(_chaos_target.x - global_position.x, 0, _chaos_target.z - global_position.z)
			if d2.length() > 0.4:
				global_position += d2.normalized() * 3.2 * delta
				rotation.y = lerp_angle(rotation.y, atan2(-d2.x, -d2.z), 1.0 - exp(-8.0 * delta))
				moving = true
				running = true
				_anim = "flail"
			else:
				_anim = ["cower", "flail", "outrage", "look_up"][int(_t * 0.7 + slot.x) % 4]
				if _chaos_timer <= 0.0:
					_chaos_timer = randf_range(1.5, 3.5)
					_pick_chaos_target(global_position, Rect2(global_position.x - 6, global_position.z - 6, 12, 12))
		M.REFORM:
			var d3 := Vector3(target.x - global_position.x, 0, target.z - global_position.z)
			if d3.length() > 0.15:
				global_position += d3.normalized() * minf(d3.length(), 2.4 * delta)
				rotation.y = lerp_angle(rotation.y, atan2(-d3.x, -d3.z), 1.0 - exp(-6.0 * delta))
				moving = true
				_anim = "idle"
			else:
				rotation.y = lerp_angle(rotation.y, heading, 1.0 - exp(-6.0 * delta))
				_anim = "attention"
	global_position.y = ground_y
	if moving:
		_phase += delta * (9.0 if running else 6.5)
	People.animate(parts, _anim, _phase, moving, running, _t)
	if state == M.MARCH and moving:
		# Parade step: stiff, high arm swing.
		(parts["arm_l"] as Node3D).rotation.x = -sin(_phase) * 0.7
