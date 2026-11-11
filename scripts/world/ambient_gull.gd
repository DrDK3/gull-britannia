extends Node3D
## Background gulls: circling the harbour or loafing on rooftops. They make the
## point that a gull over Dartmouth is the most ordinary thing in the world.

const GullModel = preload("res://scripts/world/gull_model.gd")

var center := Vector3.ZERO
var radius := 30.0
var height := 25.0
var speed := 0.25
var perched := false
var _angle := 0.0
var _model: Node3D
var _bob := 0.0


func _ready() -> void:
	_model = GullModel.new()
	_model.size = randf_range(0.95, 1.1)
	add_child(_model)
	_angle = randf() * TAU
	_bob = randf() * 10.0
	if perched:
		_model.fold(true)
		global_position = center
		rotation.y = randf() * TAU
	else:
		_model.flap_rate = randf_range(2.8, 3.6)


func _process(delta: float) -> void:
	if perched:
		return
	_bob += delta
	_angle += speed * delta
	var p := center + Vector3(cos(_angle) * radius, height + sin(_bob * 0.4) * 2.5, sin(_angle) * radius * 0.8)
	var fwd := Vector3(-sin(_angle) * radius, 0, cos(_angle) * radius * 0.8).normalized() * signf(speed)
	global_position = p
	if fwd.length() > 0.1:
		look_at(p + fwd, Vector3.UP)
	rotation.z = -0.35 * signf(speed)
	# Glide most of the time, flap occasionally.
	_model.flapping = fmod(_bob, 6.0) < 1.6
	if not _model.flapping:
		_model.fold(false)
		_model.flapping = false
