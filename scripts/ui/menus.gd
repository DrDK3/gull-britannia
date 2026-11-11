extends CanvasLayer
## Title, operations list, briefing dossier, pause, settings and the
## performance review. Only playable missions are ever listed.

const UI = preload("res://scripts/ui/ui_theme.gd")
const Briefings = preload("res://scripts/missions/briefings.gd")

signal start_requested(mission_id: String)
signal launch_requested(mission_id: String)
signal resume_requested
signal restart_requested
signal abandon_requested
signal quit_requested

var _root: Control
var _screen: Control
var _type_label: Label
var _type_full := ""
var _type_pos := 0.0
var _type_speed := 0.0
var _review_lines: Array = []
var _review_box: VBoxContainer
var _review_index := 0
var _review_timer := 0.0
var _review_after: Callable
var current := ""


func _ready() -> void:
	layer = 10
	process_mode = Node.PROCESS_MODE_ALWAYS
	_root = Control.new()
	_root.set_anchors_preset(Control.PRESET_FULL_RECT)
	_root.theme = UI.theme()
	_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_root)


func hide_all() -> void:
	if _screen != null:
		_screen.queue_free()
		_screen = null
	_type_label = null
	_review_box = null
	current = ""


func _new_screen(name_: String, dim := 0.0) -> Control:
	hide_all()
	current = name_
	var s := Control.new()
	s.set_anchors_preset(Control.PRESET_FULL_RECT)
	s.mouse_filter = Control.MOUSE_FILTER_STOP
	_root.add_child(s)
	if dim > 0.0:
		var bg := ColorRect.new()
		bg.color = Color(UI.C_BG, dim)
		bg.set_anchors_preset(Control.PRESET_FULL_RECT)
		bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
		s.add_child(bg)
	_screen = s
	return s


func _center_box(parent: Control, width := 520.0) -> VBoxContainer:
	var cc := CenterContainer.new()
	cc.set_anchors_preset(Control.PRESET_FULL_RECT)
	parent.add_child(cc)
	var v := VBoxContainer.new()
	v.custom_minimum_size = Vector2(width, 0)
	v.add_theme_constant_override("separation", 10)
	cc.add_child(v)
	return v


func _focus_first(box: Control) -> void:
	for c in box.get_children():
		if c is Button and not (c as Button).disabled:
			(c as Button).call_deferred("grab_focus")
			return


# --------------------------------------------------------------------------
# Title
# --------------------------------------------------------------------------

func show_title() -> void:
	var s := _new_screen("title")
	var grad := ColorRect.new()
	grad.color = Color(0.02, 0.03, 0.05, 0.55)
	grad.set_anchors_preset(Control.PRESET_LEFT_WIDE)
	grad.offset_right = 620.0
	grad.mouse_filter = Control.MOUSE_FILTER_IGNORE
	s.add_child(grad)
	var v := VBoxContainer.new()
	v.position = Vector2(70, 90)
	v.add_theme_constant_override("separation", 12)
	s.add_child(v)
	v.add_child(UI.label("SECTION G PRESENTS", 15, UI.C_ACCENT, UI.mono()))
	var t := UI.label("GULL\nBRITANNIA", 72, UI.C_TEXT, UI.serif())
	t.add_theme_constant_override("line_spacing", -12)
	v.add_child(t)
	var sub := UI.label("Dartmouth, 1967. The Soviets hold the Dart.\nThe Resistance has gulls.", 19, Color(0.85, 0.83, 0.78), UI.mono())
	v.add_child(sub)
	var sp := Control.new()
	sp.custom_minimum_size = Vector2(0, 24)
	v.add_child(sp)
	var next: Dictionary = Game.suggested_mission()
	var begin_text := "Begin Operations" if not Game.is_completed("m1") else "Continue: " + str(next["title"])
	v.add_child(UI.button(begin_text, func(): start_requested.emit(next["id"]), 340))
	v.add_child(UI.button("Operations", show_select, 340))
	v.add_child(UI.button("Settings", func(): show_settings(show_title), 340))
	v.add_child(UI.button("Quit", func(): quit_requested.emit(), 340))
	var foot := UI.label("Godot %s · Compatibility renderer · All art and music generated in-engine" % Engine.get_version_info()["string"], 12, UI.C_DIM)
	foot.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	foot.position = Vector2(70, -40)
	s.add_child(foot)
	_focus_first(v)


# --------------------------------------------------------------------------
# Operations (mission select) — playable missions only
# --------------------------------------------------------------------------

func show_select() -> void:
	var s := _new_screen("select", 0.75)
	var v := _center_box(s, 720)
	v.add_child(UI.label("OPERATIONS", 34, UI.C_TEXT, UI.serif()))
	v.add_child(UI.label("Section G campaign file. Progress is saved on this machine.", 14, UI.C_DIM, UI.mono()))
	for m in Game.playable_missions():
		var id: String = m["id"]
		var unlocked := Game.is_unlocked(id)
		var p: Dictionary = Game.progress.get(id, {})
		var status := "NOT YET ATTEMPTED"
		if p.get("completed", false):
			status = "COMPLETE — best %d (%s)" % [int(p.get("best_score", 0)), str(p.get("best_grade", ""))]
		if not unlocked:
			status = "CLASSIFIED — complete the previous operation"
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 16)
		var b := UI.button("%d. %s" % [int(m["number"]), m["title"]], func(): start_requested.emit(id), 360)
		b.disabled = not unlocked
		row.add_child(b)
		var info := VBoxContainer.new()
		info.add_child(UI.label(str(m["blurb"]), 14, UI.C_TEXT))
		info.add_child(UI.label(status, 12, UI.C_GOOD if p.get("completed", false) else UI.C_DIM, UI.mono()))
		row.add_child(info)
		v.add_child(row)
	var sp := Control.new()
	sp.custom_minimum_size = Vector2(0, 12)
	v.add_child(sp)
	v.add_child(UI.button("Back", show_title, 200))
	_focus_first(v)
	for c in v.get_children():
		if c is HBoxContainer:
			_focus_first(c)
			break


# --------------------------------------------------------------------------
# Briefing
# --------------------------------------------------------------------------

func show_briefing(mission_id: String) -> void:
	var info := Game.mission_info(mission_id)
	var br := Briefings.get_briefing(mission_id)
	var s := _new_screen("briefing", 0.82)
	var cc := CenterContainer.new()
	cc.set_anchors_preset(Control.PRESET_FULL_RECT)
	s.add_child(cc)
	var paper := UI.paper_panel()
	paper.custom_minimum_size = Vector2(860, 0)
	cc.add_child(paper)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 8)
	paper.add_child(v)
	var head := HBoxContainer.new()
	head.add_child(UI.label(str(br.get("file", "SECTION G")), 14, UI.C_INK, UI.mono()))
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(spacer)
	head.add_child(UI.label("MOST SECRET", 18, UI.C_STAMP, UI.mono()))
	v.add_child(head)
	v.add_child(UI.label("OPERATION: " + str(info.get("title", "")).to_upper(), 28, UI.C_INK, UI.serif()))
	v.add_child(UI.label(str(br.get("dateline", "")), 13, Color(0.35, 0.32, 0.28), UI.mono()))
	var body := UI.label("", 15, UI.C_INK, UI.mono())
	body.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	body.custom_minimum_size = Vector2(800, 0)
	v.add_child(body)
	_type_label = body
	_type_full = str(br.get("body", ""))
	_type_pos = 0.0
	_type_speed = 900.0 if Game.get_b("reduced_motion") else 260.0
	var orders := "ORDERS:\n"
	var i := 1
	for o in br.get("orders", []):
		orders += "  %d. %s\n" % [i, o]
		i += 1
	v.add_child(UI.label(orders, 14, Color(0.25, 0.1, 0.08), UI.mono()))
	v.add_child(UI.label(str(br.get("signed", "")), 14, UI.C_INK, UI.mono()))
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 12)
	row.alignment = BoxContainer.ALIGNMENT_END
	row.add_child(UI.button("Back", show_select, 160))
	var go := UI.button("Begin Operation", func(): launch_requested.emit(mission_id), 260)
	row.add_child(go)
	v.add_child(row)
	go.call_deferred("grab_focus")
	Sfx.play_music("theme")


func _process(delta: float) -> void:
	if _type_label != null and is_instance_valid(_type_label) and _type_pos < _type_full.length():
		var before := int(_type_pos)
		_type_pos = minf(_type_pos + _type_speed * delta, _type_full.length())
		_type_label.text = _type_full.substr(0, int(_type_pos))
		if int(_type_pos) / 6 != before / 6:
			Sfx.play("type", -14.0, randf_range(0.9, 1.2))
	if _review_box != null and is_instance_valid(_review_box) and _review_index < _review_lines.size():
		_review_timer -= delta
		if _review_timer <= 0.0:
			_review_timer = 0.05 if Game.get_b("reduced_motion") else 0.28
			var l: Control = _review_lines[_review_index]
			l.visible = true
			_review_index += 1
			Sfx.play("type", -8.0)
			if _review_index >= _review_lines.size() and _review_after.is_valid():
				_review_after.call()


func _unhandled_input(event: InputEvent) -> void:
	if current == "briefing" and _type_label != null and event.is_action_pressed("ui_accept") and _type_pos < _type_full.length():
		_type_pos = _type_full.length()
		_type_label.text = _type_full
		get_viewport().set_input_as_handled()


# --------------------------------------------------------------------------
# Pause
# --------------------------------------------------------------------------

func show_pause() -> void:
	var s := _new_screen("pause", 0.6)
	var v := _center_box(s, 360)
	v.add_child(UI.label("PAUSED", 34, UI.C_TEXT, UI.serif()))
	v.add_child(UI.button("Resume", func(): resume_requested.emit(), 340))
	v.add_child(UI.button("Restart Mission", func(): restart_requested.emit(), 340))
	v.add_child(UI.button("Settings", func(): show_settings(show_pause), 340))
	v.add_child(UI.button("Abandon to Menu", func(): abandon_requested.emit(), 340))
	v.add_child(UI.label("Esc to resume · H toggles the controls panel", 13, UI.C_DIM))
	_focus_first(v)


# --------------------------------------------------------------------------
# Settings
# --------------------------------------------------------------------------

func show_settings(back: Callable) -> void:
	var s := _new_screen("settings", 0.8)
	var v := _center_box(s, 560)
	v.add_child(UI.label("SETTINGS", 34, UI.C_TEXT, UI.serif()))
	_slider(v, "Mouse sensitivity", "mouse_sensitivity", 0.2, 3.0, 0.05)
	_check(v, "Invert Y axis", "invert_y")
	_check(v, "Reduced motion (no camera roll, head bob or shake)", "reduced_motion")
	_slider(v, "Field of view", "fov", 65.0, 100.0, 1.0)
	_slider(v, "Master volume", "master_volume", 0.0, 1.0, 0.05)
	_slider(v, "Music volume", "music_volume", 0.0, 1.0, 0.05)
	_slider(v, "Effects volume", "sfx_volume", 0.0, 1.0, 0.05)
	_check(v, "Show poop drop marker", "drop_marker")
	_check(v, "Show controls panel", "show_controls")
	_check(v, "Fullscreen", "fullscreen")
	_check(v, "Unlock all operations", "unlock_all")
	v.add_child(UI.button("Done", func():
		Game.save_settings()
		back.call(), 200))
	_focus_first(v)


func _slider(parent: Control, text: String, key: String, lo: float, hi: float, step: float) -> void:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 12)
	var l := UI.label(text, 16)
	l.custom_minimum_size = Vector2(220, 0)
	l.mouse_filter = Control.MOUSE_FILTER_PASS
	row.add_child(l)
	var sl := HSlider.new()
	sl.min_value = lo
	sl.max_value = hi
	sl.step = step
	sl.value = Game.get_f(key)
	sl.custom_minimum_size = Vector2(240, 24)
	sl.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(sl)
	var val := UI.label("%.2f" % sl.value, 14, UI.C_DIM)
	row.add_child(val)
	sl.value_changed.connect(func(x: float):
		Game.set_setting(key, x)
		val.text = "%.2f" % x)
	parent.add_child(row)


func _check(parent: Control, text: String, key: String) -> void:
	var cb := CheckBox.new()
	cb.text = text
	cb.button_pressed = Game.get_b(key)
	cb.toggled.connect(func(on: bool): Game.set_setting(key, on))
	parent.add_child(cb)


# --------------------------------------------------------------------------
# Performance review
# --------------------------------------------------------------------------

func show_results(r: Dictionary, new_best: bool, next_info: Dictionary) -> void:
	var s := _new_screen("results", 0.85)
	var scroll := ScrollContainer.new()
	scroll.set_anchors_preset(Control.PRESET_FULL_RECT)
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	s.add_child(scroll)
	var cc := CenterContainer.new()
	cc.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	cc.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.add_child(cc)
	var paper := UI.paper_panel()
	paper.custom_minimum_size = Vector2(820, 0)
	cc.add_child(paper)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 4)
	paper.add_child(v)
	_review_lines = []
	_review_index = 0
	_review_timer = 0.6
	var head := HBoxContainer.new()
	head.add_child(UI.label("SECTION G — PERFORMANCE REVIEW (FORM G/17b)", 14, UI.C_INK, UI.mono()))
	v.add_child(head)
	v.add_child(UI.label("OPERATION: " + str(r["title"]).to_upper(), 26, UI.C_INK, UI.serif()))
	v.add_child(UI.label("Operative: SCRUMPY (Herring Gull)        Duration: " + _fmt(float(r["time"])), 13, Color(0.35, 0.32, 0.28), UI.mono()))
	var sep := ColorRect.new()
	sep.color = Color(0.3, 0.27, 0.22, 0.6)
	sep.custom_minimum_size = Vector2(0, 2)
	v.add_child(sep)
	for line in r["lines"]:
		var row := HBoxContainer.new()
		var a := UI.label(str(line[0]), 15, UI.C_INK, UI.mono())
		a.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(a)
		var pts := int(line[1])
		row.add_child(UI.label(("+%d" % pts) if pts > 0 else "—", 15, UI.C_INK if pts > 0 else Color(0.45, 0.42, 0.38), UI.mono()))
		row.visible = false
		v.add_child(row)
		_review_lines.append(row)
	var sep2 := ColorRect.new()
	sep2.color = Color(0.3, 0.27, 0.22, 0.6)
	sep2.custom_minimum_size = Vector2(0, 2)
	v.add_child(sep2)
	var total_row := HBoxContainer.new()
	var tl := UI.label("TOTAL", 20, UI.C_INK, UI.serif())
	tl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	total_row.add_child(tl)
	total_row.add_child(UI.label(str(r["total"]) + ("   ★ NEW BEST" if new_best else ""), 20, UI.C_INK, UI.serif()))
	total_row.visible = false
	v.add_child(total_row)
	_review_lines.append(total_row)
	var stamp := UI.label("ASSESSMENT: %s — %s" % [r["grade"], str(r["grade_title"]).to_upper()], 24, UI.C_STAMP, UI.mono())
	stamp.visible = false
	v.add_child(stamp)
	_review_lines.append(stamp)
	var remarks := ""
	for rm in r["remarks"]:
		remarks += "• " + str(rm) + "\n"
	var rl := UI.label("REMARKS:\n" + remarks, 13, UI.C_INK, UI.mono())
	rl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	rl.custom_minimum_size = Vector2(760, 0)
	rl.visible = false
	v.add_child(rl)
	_review_lines.append(rl)
	if str(r.get("debrief", "")) != "":
		var dl := UI.label(str(r["debrief"]), 13, Color(0.2, 0.12, 0.08), UI.mono())
		dl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		dl.custom_minimum_size = Vector2(760, 0)
		dl.visible = false
		v.add_child(dl)
		_review_lines.append(dl)
	var row2 := HBoxContainer.new()
	row2.add_theme_constant_override("separation", 10)
	row2.alignment = BoxContainer.ALIGNMENT_END
	row2.add_child(UI.button("Main Menu", show_title, 160))
	row2.add_child(UI.button("Operations", show_select, 170))
	var retry := UI.button("Retry", func(): restart_requested.emit(), 140)
	row2.add_child(retry)
	if not next_info.is_empty():
		var nb := UI.button("Next: " + str(next_info["title"]), func(): start_requested.emit(next_info["id"]), 280)
		row2.add_child(nb)
		nb.call_deferred("grab_focus")
	else:
		retry.call_deferred("grab_focus")
	v.add_child(row2)
	_review_box = v
	_review_after = func():
		Sfx.play("stamp", 0.0)
	Sfx.play_music("results")


func _fmt(t: float) -> String:
	return "%d:%02d" % [int(t) / 60, int(t) % 60]
