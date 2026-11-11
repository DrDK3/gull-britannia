extends CanvasLayer
## In-mission HUD: objectives, radio messages, prompts, beak slot, payload,
## suspicion meters over guards, directional suspicion arcs, the objective
## marker, scouting feedback and the controls panel.

const UI = preload("res://scripts/ui/ui_theme.gd")

var mission: Node = null
var gull: Node = null

var _root: Control
var _overlay: Control
var _obj_title: Label
var _obj_list: VBoxContainer
var _radio_panel: PanelContainer
var _radio_speaker: Label
var _radio_text: Label
var _radio_timer := 0.0
var _banner: Label
var _banner_timer := 0.0
var _prompt: Label
var _beak: Label
var _payload: Label
var _flight: Label
var _score: Label
var _controls_panel: PanelContainer
var _controls: Label
var _toasts: VBoxContainer
var _scout_label: Label
var _font: Font


func _ready() -> void:
	layer = 5
	_font = ThemeDB.fallback_font
	_root = Control.new()
	_root.set_anchors_preset(Control.PRESET_FULL_RECT)
	_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_root.theme = UI.theme()
	add_child(_root)

	_overlay = Control.new()
	_overlay.set_anchors_preset(Control.PRESET_FULL_RECT)
	_overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_overlay.draw.connect(_draw_overlay)
	_root.add_child(_overlay)

	# Objectives (top left).
	var obj_panel := UI.panel(Color(0.04, 0.06, 0.09, 0.72))
	obj_panel.position = Vector2(16, 16)
	obj_panel.custom_minimum_size = Vector2(430, 0)
	_root.add_child(obj_panel)
	var ov := VBoxContainer.new()
	ov.add_theme_constant_override("separation", 3)
	obj_panel.add_child(ov)
	_obj_title = UI.label("", 15, UI.C_ACCENT)
	ov.add_child(_obj_title)
	_obj_list = VBoxContainer.new()
	_obj_list.add_theme_constant_override("separation", 2)
	ov.add_child(_obj_list)

	# Score (top right).
	_score = UI.label("", 17, UI.C_TEXT)
	_score.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_score.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	_score.position = Vector2(-336, 16)
	_score.size = Vector2(320, 30)
	_root.add_child(_score)

	# Radio (top centre).
	_radio_panel = UI.panel(Color(0.04, 0.07, 0.05, 0.86))
	_radio_panel.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	_radio_panel.grow_vertical = Control.GROW_DIRECTION_BEGIN
	_radio_panel.position = Vector2(-300, -232)
	_radio_panel.custom_minimum_size = Vector2(600, 0)
	_radio_panel.size = Vector2(600, 0)
	_root.add_child(_radio_panel)
	var rv := VBoxContainer.new()
	_radio_panel.add_child(rv)
	_radio_speaker = UI.label("", 13, Color(0.6, 0.95, 0.6))
	rv.add_child(_radio_speaker)
	_radio_text = UI.label("", 17, UI.C_TEXT)
	_radio_text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_radio_text.custom_minimum_size = Vector2(570, 0)
	rv.add_child(_radio_text)
	_radio_panel.visible = false

	# Banner.
	_banner = UI.label("", 34, UI.C_BAD)
	_banner.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_banner.set_anchors_preset(Control.PRESET_CENTER_TOP)
	_banner.position = Vector2(-300, 150)
	_banner.size = Vector2(600, 50)
	_banner.add_theme_constant_override("outline_size", 8)
	_banner.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.85))
	_banner.visible = false
	_root.add_child(_banner)

	_scout_label = UI.label("SCOUTING — hold on a guard to tag", 16, Color(0.85, 0.92, 1.0))
	_scout_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_scout_label.set_anchors_preset(Control.PRESET_CENTER)
	_scout_label.position = Vector2(-250, 120)
	_scout_label.size = Vector2(500, 30)
	_scout_label.visible = false
	_root.add_child(_scout_label)

	# Prompt (bottom centre).
	_prompt = UI.label("", 19, UI.C_TEXT)
	_prompt.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_prompt.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	_prompt.position = Vector2(-400, -120)
	_prompt.size = Vector2(800, 30)
	_prompt.add_theme_constant_override("outline_size", 6)
	_prompt.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.9))
	_root.add_child(_prompt)

	# Beak / payload / flight (bottom right).
	var br := UI.panel(Color(0.04, 0.06, 0.09, 0.72))
	br.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	br.position = Vector2(-336, -112)
	br.custom_minimum_size = Vector2(320, 96)
	_root.add_child(br)
	var bv := VBoxContainer.new()
	br.add_child(bv)
	_beak = UI.label("", 17, UI.C_TEXT)
	bv.add_child(_beak)
	_payload = UI.label("", 15, UI.C_TEXT)
	bv.add_child(_payload)
	_flight = UI.label("", 13, UI.C_DIM)
	bv.add_child(_flight)

	# Controls (bottom left).
	_controls_panel = UI.panel(Color(0.04, 0.06, 0.09, 0.66))
	_controls_panel.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	_controls_panel.position = Vector2(16, -246)
	_root.add_child(_controls_panel)
	_controls = UI.label("", 13, UI.C_TEXT)
	_controls_panel.add_child(_controls)
	_controls_panel.visible = Game.get_b("show_controls")

	# Toasts (right side).
	_toasts = VBoxContainer.new()
	_toasts.anchor_left = 1.0
	_toasts.anchor_right = 1.0
	_toasts.anchor_top = 0.5
	_toasts.anchor_bottom = 0.5
	_toasts.offset_left = -470.0
	_toasts.offset_right = -16.0
	_toasts.offset_top = -170.0
	_toasts.offset_bottom = 110.0
	_toasts.alignment = BoxContainer.ALIGNMENT_END
	_toasts.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_root.add_child(_toasts)


func bind(m: Node) -> void:
	mission = m
	gull = m.gull
	m.objectives_changed.connect(_refresh_objectives)
	m.radio.connect(show_radio)
	m.toast.connect(show_toast)
	m.banner.connect(show_banner)
	_refresh_objectives()


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("help"):
		_controls_panel.visible = not _controls_panel.visible
		Game.set_setting("show_controls", _controls_panel.visible)
		Game.save_settings()


func show_radio(speaker: String, text: String, duration: float) -> void:
	_radio_speaker.text = "RADIO — " + speaker.to_upper()
	_radio_text.text = text
	_radio_panel.visible = true
	_radio_panel.reset_size()
	_radio_panel.position.y = _root.size.y - 150.0 - _radio_panel.get_combined_minimum_size().y
	_radio_timer = duration
	Sfx.play("click", -10.0)


func show_toast(text: String, color: Color) -> void:
	var l := UI.label(text, 16, color)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.custom_minimum_size = Vector2(450, 0)
	l.add_theme_constant_override("outline_size", 6)
	l.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.85))
	_toasts.add_child(l)
	while _toasts.get_child_count() > 6:
		var c := _toasts.get_child(0)
		_toasts.remove_child(c)
		c.queue_free()
	var tw := l.create_tween()
	tw.tween_interval(3.2)
	tw.tween_property(l, "modulate:a", 0.0, 0.8)
	tw.tween_callback(l.queue_free)


func show_banner(text: String, color: Color, duration: float) -> void:
	_banner.text = text
	_banner.add_theme_color_override("font_color", color)
	_banner.visible = true
	_banner_timer = duration


func _refresh_objectives() -> void:
	if mission == null:
		return
	_obj_title.text = "OPERATION: " + str(mission.title).to_upper()
	for c in _obj_list.get_children():
		c.queue_free()
	for o in mission.objectives:
		var st: String = o["state"]
		if st == "hidden":
			continue
		var prefix := "▸ "
		var col := UI.C_TEXT
		if st == "done":
			prefix = "✓ "
			col = Color(0.55, 0.75, 0.55)
		elif o["optional"]:
			prefix = "○ "
			col = UI.C_DIM
		var l := UI.label(prefix + str(o["text"]), 15, col)
		l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		l.custom_minimum_size = Vector2(410, 0)
		_obj_list.add_child(l)


func _process(delta: float) -> void:
	if mission == null or gull == null:
		return
	if _radio_timer > 0.0:
		_radio_timer -= delta
		if _radio_timer <= 0.0:
			_radio_panel.visible = false
	if _banner_timer > 0.0:
		_banner_timer -= delta
		if _banner_timer <= 0.0:
			_banner.visible = false
	_prompt.text = mission.get_prompt()
	var it: Node3D = gull.beak_item
	if it == null:
		_beak.text = "BEAK: empty"
		_beak.add_theme_color_override("font_color", UI.C_DIM)
	elif it.is_mission:
		_beak.text = "BEAK: " + it.display_name + "  [SECRET]"
		_beak.add_theme_color_override("font_color", UI.C_ACCENT)
	else:
		_beak.text = "BEAK: " + it.display_name + ("  ★ bonus" if it.bonus_points > 0 else "")
		_beak.add_theme_color_override("font_color", Color(1.0, 0.85, 0.35))
	var maxp: int = gull.profile["max_payload"]
	var pips := ""
	for i in maxp:
		pips += "● " if i < gull.payload else "○ "
	_payload.text = "PAYLOAD  " + pips
	var spd: float = gull.velocity.length()
	_flight.text = "%s   SPD %d   ALT %d m   %s" % [gull.mode_name(), int(spd), int(gull.global_position.y), str(gull.profile["name"]).to_upper()]
	_score.text = "SCORE %d    %s" % [mission.live_score(), mission.fmt_time(mission.elapsed)]
	_scout_label.visible = gull.scouting
	_controls.text = _controls_text()
	_overlay.queue_redraw()


func _controls_text() -> String:
	if gull.mode == 0 or gull.mode == 2:
		var t := "ON FOOT / PERCHED\n"
		t += "Mouse  look        WASD  walk (Shift: hurry)\n"
		t += "Space  take off\n"
		t += "E  grab / set down / deliver     F  eat\n"
		t += "Q or LMB  poop     RMB  scout & tag guards\n"
		if mission.has_method("signal_hint") and mission.signal_hint() != "":
			t += mission.signal_hint() + "\n"
		t += "H  hide help       Esc  pause / restart"
		return t
	var a := "FLYING\n"
	a += "Mouse  steer       A / D  bank\n"
	a += "W  flap (speed)    Space  flap (climb)\n"
	a += "S  brake / flare   Shift  dive\n"
	a += "Ctrl  landing assist (glide onto a perch)\n"
	a += "E  snatch / deliver     F  eat in flight\n"
	a += "Q or LMB  poop     RMB  scout & tag guards\n"
	if mission.has_method("signal_hint") and mission.signal_hint() != "":
		a += mission.signal_hint() + "\n"
	a += "H  hide help       Esc  pause / restart"
	return a


# --------------------------------------------------------------------------
# Overlay drawing
# --------------------------------------------------------------------------

func _draw_overlay() -> void:
	if mission == null or gull == null:
		return
	var cam: Camera3D = gull.camera
	if cam == null:
		return
	var vp := _overlay.size
	var center := vp * 0.5
	# Crosshair.
	_overlay.draw_circle(center, 2.5, Color(1, 1, 1, 0.75))
	if gull.drop_on_target and Game.get_b("drop_marker"):
		_overlay.draw_string(_font, center + Vector2(-60, 34), "ON TARGET", HORIZONTAL_ALIGNMENT_CENTER, 120, 15, Color(1.0, 0.45, 0.3))
	if gull.scouting:
		_draw_scout_frame(vp)
	# Objective marker.
	var tgt: Variant = mission.current_target()
	if tgt != null:
		_draw_marker(cam, tgt, vp, Color(1.0, 0.86, 0.35), true)
	# Guards: meters above heads and directional arcs.
	for g in mission.guards:
		_draw_guard(cam, g, vp, center)
	# Items when scouting.
	if gull.scouting:
		for it in mission.items:
			if is_instance_valid(it) and it.is_grabbable():
				var p: Vector3 = it.global_position
				var ip: Variant = _project(cam, p)
				if ip != null and cam.global_position.distance_to(p) < 120.0:
					var sp: Vector2 = ip
					var col := Color(1.0, 0.85, 0.35) if it.is_food else Color(1.0, 0.45, 0.4)
					_overlay.draw_arc(sp, 9.0, 0, TAU, 16, col, 2.0)
					_overlay.draw_string(_font, sp + Vector2(12, 5), it.display_name, HORIZONTAL_ALIGNMENT_LEFT, -1, 14, col)


func _draw_scout_frame(vp: Vector2) -> void:
	var c := Color(0, 0, 0, 0.35)
	_overlay.draw_rect(Rect2(0, 0, vp.x, vp.y * 0.08), c)
	_overlay.draw_rect(Rect2(0, vp.y * 0.92, vp.x, vp.y * 0.08), c)
	var m := 60.0
	var l := 40.0
	var w := Color(0.85, 0.92, 1.0, 0.8)
	for corner in [Vector2(m, m + 40), Vector2(vp.x - m, m + 40), Vector2(m, vp.y - m - 40), Vector2(vp.x - m, vp.y - m - 40)]:
		var sx := 1.0 if corner.x < vp.x * 0.5 else -1.0
		var sy := 1.0 if corner.y < vp.y * 0.5 else -1.0
		_overlay.draw_line(corner, corner + Vector2(l * sx, 0), w, 2.0)
		_overlay.draw_line(corner, corner + Vector2(0, l * sy), w, 2.0)


## Projects a point; returns null when it is not safely in front of the camera.
static func _project(cam: Camera3D, p: Vector3) -> Variant:
	var local := cam.global_transform.affine_inverse() * p
	if local.z > -0.1:
		return null
	return cam.unproject_position(p)


func _draw_marker(cam: Camera3D, world_pos: Vector3, vp: Vector2, col: Color, show_dist: bool) -> void:
	var dist := cam.global_position.distance_to(world_pos)
	var proj: Variant = _project(cam, world_pos)
	var behind := proj == null
	var c := vp * 0.5
	var sp: Vector2 = c
	if not behind:
		sp = proj
	var margin := 40.0
	var on_screen := not behind and sp.x > margin and sp.x < vp.x - margin and sp.y > margin and sp.y < vp.y - margin
	if not on_screen:
		var d := sp - c
		if behind:
			var local := cam.global_transform.affine_inverse() * world_pos
			d = Vector2(local.x, -local.y)
			if d.length() < 0.01:
				d = Vector2(0, 1)
		var k := minf((vp.x * 0.5 - margin) / maxf(absf(d.x), 0.001), (vp.y * 0.5 - margin) / maxf(absf(d.y), 0.001))
		sp = c + d * k
		var ang := d.angle()
		var pts := PackedVector2Array([sp + Vector2(14, 0).rotated(ang), sp + Vector2(-8, 9).rotated(ang), sp + Vector2(-8, -9).rotated(ang)])
		_overlay.draw_colored_polygon(pts, col)
	else:
		var s := 9.0
		var pts2 := PackedVector2Array([sp + Vector2(0, -s), sp + Vector2(s, 0), sp + Vector2(0, s), sp + Vector2(-s, 0)])
		_overlay.draw_colored_polygon(pts2, Color(col, 0.35))
		pts2.append(sp + Vector2(0, -s))
		_overlay.draw_polyline(pts2, col, 2.0)
	if show_dist:
		_overlay.draw_string(_font, sp + Vector2(-20, 26), "%d m" % int(dist), HORIZONTAL_ALIGNMENT_CENTER, 40, 14, col)


func _draw_guard(cam: Camera3D, g: Node3D, vp: Vector2, center: Vector2) -> void:
	var head: Vector3 = g.head_position() + Vector3(0, 0.75, 0)
	var dist := cam.global_position.distance_to(head)
	var susp: float = g.suspicion
	var st: int = g.state
	var col := Color(1, 1, 1, 0.8)
	var icon := ""
	match st:
		1, 2:
			col = Color(1.0, 0.85, 0.2)
			icon = "?"
		3:
			col = Color(1.0, 0.25, 0.2)
			icon = "!"
		4:
			col = Color(1.0, 0.55, 0.15)
			icon = "?"
		6:
			col = Color(0.55, 0.75, 1.0)
			icon = "…"
		7:
			col = Color(1.0, 0.85, 0.2)
			icon = "!"
	var visible_marker: bool = dist < 110.0 and (g.tagged or susp > 1.0 or st != 0)
	# Directional suspicion arc around the crosshair (visible even off-screen).
	if susp > 1.0 or st == 3:
		var local := cam.global_transform.affine_inverse() * g.global_position
		var ang := atan2(local.x, -local.z)
		var span := deg_to_rad(16.0 + susp * 0.22)
		var rad := 78.0
		var acol := Color(1.0, lerpf(0.85, 0.2, susp / 100.0), 0.2, 0.35 + susp / 160.0)
		_overlay.draw_arc(center, rad, ang - PI * 0.5 - span * 0.5, ang - PI * 0.5 + span * 0.5, 16, acol, 3.0 + susp * 0.05)
	if not visible_marker:
		return
	var proj: Variant = _project(cam, head)
	if proj == null:
		return
	var sp: Vector2 = proj
	if sp.x < 0 or sp.y < 0 or sp.x > vp.x or sp.y > vp.y:
		return
	# Meter.
	var w := 38.0
	var h := 6.0
	var r := Rect2(sp + Vector2(-w * 0.5, 0), Vector2(w, h))
	_overlay.draw_rect(r, Color(0, 0, 0, 0.6))
	_overlay.draw_rect(Rect2(r.position, Vector2(w * clampf(susp / 100.0, 0.0, 1.0), h)), col)
	_overlay.draw_rect(r, Color(1, 1, 1, 0.5), false, 1.0)
	if icon != "":
		_overlay.draw_string(_font, sp + Vector2(18, 10), icon, HORIZONTAL_ALIGNMENT_LEFT, 24, 26, col)
	if g.tagged and dist < 90.0:
		_overlay.draw_string(_font, sp + Vector2(-110, -30), str(g.guard_name), HORIZONTAL_ALIGNMENT_CENTER, 220, 13, Color(0.95, 0.85, 0.55))
		var sub: String = g.state_name().to_upper()
		if g.state == 0 and str(g.routine_text) != "":
			sub = str(g.routine_text)
		_overlay.draw_string(_font, sp + Vector2(-110, 20), sub, HORIZONTAL_ALIGNMENT_CENTER, 220, 12, col)
	# Tag progress ring while scouting.
	var tp: float = mission.tag_progress(g)
	if gull.scouting and tp > 0.0 and not g.tagged:
		var bp: Variant = _project(cam, g.global_position + Vector3(0, 1.0, 0))
		if bp != null:
			_overlay.draw_arc(bp, 26.0, -PI * 0.5, -PI * 0.5 + TAU * tp, 24, Color(0.85, 0.92, 1.0), 3.0)
