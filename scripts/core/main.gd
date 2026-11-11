extends Node
## Screen flow: title (over a slow fly-by of the harbour) -> briefing ->
## mission -> performance review. Handles pause and restart. Restart always
## rebuilds the mission from scratch, so pickups, objectives, score and guard
## behaviour are reset by construction.
##
## Command-line (after `--`):
##   --mission=m1        go straight to a mission's briefing
##   --skip-briefing     with --mission, start playing immediately
##   --autotest=all      run the automated checks and quit
##   --unlock-all        list every playable operation as unlocked
##   --fresh-progress    ignore and do not write saved progress

const Menus = preload("res://scripts/ui/menus.gd")
const Hud = preload("res://scripts/ui/hud.gd")
const Dartmouth = preload("res://scripts/world/dartmouth.gd")

var menus: CanvasLayer
var hud: CanvasLayer
var mission: Node3D
var mission_id := ""
var backdrop: Node3D
var _backdrop_cam: Camera3D
var _t := 0.0


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	menus = Menus.new()
	add_child(menus)
	menus.start_requested.connect(show_briefing)
	menus.launch_requested.connect(launch)
	menus.resume_requested.connect(resume)
	menus.restart_requested.connect(restart)
	menus.abandon_requested.connect(abandon)
	menus.quit_requested.connect(func(): get_tree().quit())
	if Game.cmd.has("autotest"):
		var test_script: Script = load("res://tests/autotest.gd")
		if test_script == null or not test_script.can_instantiate():
			push_error("autotest script failed to load")
			get_tree().quit(2)
			return
		var tester: Node = test_script.new()
		tester.main = self
		add_child(tester)
		return
	if Game.cmd.has("mission"):
		var id := str(Game.cmd["mission"])
		if Game.cmd.has("skip-briefing"):
			launch(id)
		else:
			_show_backdrop()
			show_briefing(id)
		return
	_show_backdrop()
	menus.show_title()
	Sfx.play_music("theme")


func _show_backdrop() -> void:
	if backdrop != null:
		return
	backdrop = Node3D.new()
	backdrop.name = "Backdrop"
	add_child(backdrop)
	var w := Dartmouth.new()
	backdrop.add_child(w)
	w.build({"occupation": 1})
	_backdrop_cam = Camera3D.new()
	_backdrop_cam.far = 1600.0
	_backdrop_cam.fov = 60.0
	backdrop.add_child(_backdrop_cam)
	_backdrop_cam.current = true
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE


func _free_backdrop() -> void:
	if backdrop != null:
		backdrop.queue_free()
		backdrop = null
		_backdrop_cam = null


func _process(delta: float) -> void:
	_t += delta
	if _backdrop_cam != null:
		var a := _t * 0.035 + 2.2
		var center := Vector3(10, 4, 10)
		_backdrop_cam.global_position = center + Vector3(cos(a) * 95.0, 38.0 + sin(_t * 0.05) * 6.0, sin(a) * 95.0)
		_backdrop_cam.look_at(center + Vector3(0, 0, 0), Vector3.UP)


func show_briefing(id: String) -> void:
	if not Game.is_unlocked(id) and not Game.cmd.has("mission"):
		return
	_clear_mission()
	get_tree().paused = false
	_show_backdrop()
	menus.show_briefing(id)


func launch(id: String) -> void:
	var info := Game.mission_info(id)
	if info.is_empty() or not info["playable"]:
		push_error("Mission not playable: " + id)
		menus.show_title()
		return
	_clear_mission()
	_free_backdrop()
	get_tree().paused = false
	mission_id = id
	var script: Script = load(info["script"])
	mission = script.new()
	mission.name = "Mission"
	add_child(mission)
	mission.process_mode = Node.PROCESS_MODE_PAUSABLE
	hud = Hud.new()
	hud.process_mode = Node.PROCESS_MODE_PAUSABLE
	add_child(hud)
	hud.bind(mission)
	mission.finished.connect(_on_finished)
	menus.hide_all()
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	mission.start()


func _clear_mission() -> void:
	Sfx.stop_loops()
	if hud != null:
		hud.queue_free()
		hud = null
	if mission != null:
		mission.queue_free()
		mission = null


func restart() -> void:
	if mission_id == "":
		return
	launch(mission_id)


func resume() -> void:
	get_tree().paused = false
	menus.hide_all()
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED


func pause() -> void:
	if mission == null or not mission.running:
		return
	get_tree().paused = true
	Sfx.stop_loops()
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	menus.show_pause()


func abandon() -> void:
	_clear_mission()
	get_tree().paused = false
	mission_id = ""
	_show_backdrop()
	menus.show_title()
	Sfx.play_music("theme")


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("pause"):
		if menus.current == "pause":
			resume()
			get_viewport().set_input_as_handled()
		elif menus.current == "" and mission != null and mission.running:
			pause()
			get_viewport().set_input_as_handled()
	# Clicking back into the window recaptures the mouse during play.
	if event is InputEventMouseButton and event.pressed and menus.current == "" and mission != null and mission.running:
		if Input.mouse_mode != Input.MOUSE_MODE_CAPTURED:
			Input.mouse_mode = Input.MOUSE_MODE_CAPTURED


func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT and mission != null and mission.running and menus.current == "":
		pause()


func _on_finished(results: Dictionary) -> void:
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	var best := Game.record_result(mission_id, int(results["total"]), str(results["grade"]))
	menus.show_results(results, best, Game.next_mission(mission_id))
