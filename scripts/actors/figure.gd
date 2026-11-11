extends Node3D
## A scripted figure (officer, civilian) with a pose and a speech bubble.

const People = preload("res://scripts/actors/people.gd")

var style := "officer"
var anim := "attention"
var facing_yaw := 0.0
var parts: Dictionary = {}
var _t := 0.0
var _bubble: Label3D
var _bubble_t := 0.0
var _anim_timer := 0.0
var _anim_after := ""


func _ready() -> void:
	parts = People.build(self, style)
	_bubble = Label3D.new()
	_bubble.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	_bubble.no_depth_test = true
	_bubble.font_size = 40
	_bubble.outline_size = 12
	_bubble.pixel_size = 0.0048
	_bubble.modulate = Color(1, 0.95, 0.85)
	_bubble.position = Vector3(0, 2.55, 0)
	_bubble.visible = false
	add_child(_bubble)


func say(text: String, dur := 3.0) -> void:
	_bubble.text = text
	_bubble.visible = true
	_bubble_t = dur


## Play an animation for a while, then return to another.
func pose(a: String, seconds := 0.0, after := "") -> void:
	anim = a
	_anim_timer = seconds
	_anim_after = after


func _process(delta: float) -> void:
	_t += delta
	if _bubble_t > 0.0:
		_bubble_t -= delta
		if _bubble_t <= 0.0:
			_bubble.visible = false
	if _anim_timer > 0.0:
		_anim_timer -= delta
		if _anim_timer <= 0.0 and _anim_after != "":
			anim = _anim_after
	(parts["body"] as Node3D).rotation.y = facing_yaw
	People.animate(parts, anim, 0.0, false, false, _t)
