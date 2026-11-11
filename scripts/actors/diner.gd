extends Node3D
## An off-duty clerk eating chips on a bench. Harmless: he complains, flails,
## and does not report gulls. Petty theft is excellent cover.

const People = preload("res://scripts/actors/people.gd")

var style := "clerk"
var facing_yaw := -PI * 0.5
var lines := ["Hey! Bird! Those are STATE chips!", "Shoo! Shoo, you hooligan!", "My lunch! My only joy!", "Every day. Every single day."]
var parts: Dictionary = {}
var _t := 0.0
var _react := 0.0
var _bubble: Label3D
var _bubble_t := 0.0


func _ready() -> void:
	parts = People.build(self, style)
	(parts["body"] as Node3D).rotation.y = facing_yaw
	_bubble = Label3D.new()
	_bubble.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	_bubble.no_depth_test = true
	_bubble.font_size = 40
	_bubble.outline_size = 10
	_bubble.pixel_size = 0.0045
	_bubble.position = Vector3(0, 2.2, 0)
	_bubble.visible = false
	add_child(_bubble)


func react() -> void:
	_react = 2.6
	_bubble.text = lines[randi() % lines.size()]
	_bubble.visible = true
	_bubble_t = 3.0
	Sfx.play_at("huh", global_position + Vector3.UP * 1.5, 0.0, 0.8)


func _process(delta: float) -> void:
	_t += delta
	if _bubble_t > 0.0:
		_bubble_t -= delta
		if _bubble_t <= 0.0:
			_bubble.visible = false
	if _react > 0.0:
		_react -= delta
		People.animate(parts, "flail", 0.0, false, false, _t)
	else:
		People.animate(parts, "sit", 0.0, false, false, _t)
		if fmod(_t, 7.0) < 2.2:
			(parts["arm_r"] as Node3D).rotation = Vector3(-1.9 + sin(_t * 3.0) * 0.4, 0, -0.3)
