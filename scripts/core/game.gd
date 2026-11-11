extends Node
## Global state: settings, local progress saves, the input map and the
## mission registry. Registered as the `Game` autoload.

signal settings_changed

const SETTINGS_PATH := "user://settings.cfg"
const PROGRESS_PATH := "user://progress.cfg"

const DEFAULT_SETTINGS := {
	"mouse_sensitivity": 1.0,
	"invert_y": false,
	"reduced_motion": false,
	"fov": 80.0,
	"master_volume": 0.8,
	"music_volume": 0.55,
	"sfx_volume": 0.9,
	"drop_marker": true,
	"show_controls": true,
	"unlock_all": false,
	"fullscreen": false,
}

## Campaign roster. Only entries with `playable = true` are shown to the player.
const MISSIONS := [
	{
		"id": "m1", "number": 1, "title": "A Chip Off the Old Block",
		"script": "res://scripts/missions/m1_chip.gd", "playable": true,
		"blurb": "Learn to fly and perch. Steal lunch. Steal a dispatch. Deliver it.",
	},
	{
		"id": "m2", "number": 2, "title": "The Inspection",
		"script": "res://scripts/missions/m2_inspection.gd", "playable": true,
		"blurb": "Scout a parade, signal the flock, break the formation, take the order.",
	},
	{
		"id": "m3", "number": 3, "title": "Low Tide",
		"script": "", "playable": false,
		"blurb": "Strafing run over the water. Draw a patrol from the Resistance ferry.",
	},
	{
		"id": "m4", "number": 4, "title": "Das Boot, Das Gull",
		"script": "", "playable": false,
		"blurb": "Enter a Soviet submarine during resupply. Recover the secret paper.",
	},
	{
		"id": "m5", "number": 5, "title": "The Dachshund Exchange",
		"script": "", "playable": false,
		"blurb": "Heavy lift. One spoiled dachshund, one padded basket, one radio.",
	},
	{
		"id": "m6", "number": 6, "title": "The Last Ferry",
		"script": "", "playable": false,
		"blurb": "Get the contacts across the Dart before the sweep begins.",
	},
]

var settings: Dictionary = DEFAULT_SETTINGS.duplicate()
var progress: Dictionary = {}
## Parsed user command-line arguments (everything after `--`).
var cmd: Dictionary = {}


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_parse_cmdline()
	_setup_input()
	load_settings()
	load_progress()
	if cmd.has("unlock-all"):
		settings["unlock_all"] = true


# --------------------------------------------------------------------------
# Command line
# --------------------------------------------------------------------------

func _parse_cmdline() -> void:
	for arg in OS.get_cmdline_user_args():
		var a: String = arg
		if a.begins_with("--"):
			a = a.substr(2)
		var eq := a.find("=")
		if eq >= 0:
			cmd[a.substr(0, eq)] = a.substr(eq + 1)
		else:
			cmd[a] = true


# --------------------------------------------------------------------------
# Input map (built at runtime so the project needs no editor setup)
# --------------------------------------------------------------------------

func _setup_input() -> void:
	_bind("move_forward", [KEY_W])
	_bind("move_back", [KEY_S])
	_bind("move_left", [KEY_A])
	_bind("move_right", [KEY_D])
	_bind("flap", [KEY_SPACE])
	_bind("dive", [KEY_SHIFT])
	_bind("land", [KEY_CTRL, KEY_C])
	_bind("interact", [KEY_E])
	_bind("eat", [KEY_F])
	_bind("poop", [KEY_Q], [MOUSE_BUTTON_LEFT])
	_bind("scout", [KEY_Z], [MOUSE_BUTTON_RIGHT])
	_bind("signal", [KEY_G])
	_bind("help", [KEY_H, KEY_F1])
	_bind("pause", [KEY_ESCAPE, KEY_P])
	_bind("look_left", [KEY_LEFT])
	_bind("look_right", [KEY_RIGHT])
	_bind("look_up", [KEY_UP])
	_bind("look_down", [KEY_DOWN])


func _bind(action: String, keys: Array, mouse_buttons: Array = []) -> void:
	if InputMap.has_action(action):
		InputMap.erase_action(action)
	InputMap.add_action(action, 0.2)
	for k in keys:
		var ev := InputEventKey.new()
		ev.physical_keycode = k
		InputMap.action_add_event(action, ev)
	for b in mouse_buttons:
		var mb := InputEventMouseButton.new()
		mb.button_index = b
		InputMap.action_add_event(action, mb)


# --------------------------------------------------------------------------
# Settings
# --------------------------------------------------------------------------

func load_settings() -> void:
	var cf := ConfigFile.new()
	if cf.load(SETTINGS_PATH) == OK:
		for key in DEFAULT_SETTINGS.keys():
			settings[key] = cf.get_value("settings", key, DEFAULT_SETTINGS[key])
	apply_settings()


func save_settings() -> void:
	var cf := ConfigFile.new()
	for key in settings.keys():
		cf.set_value("settings", key, settings[key])
	cf.save(SETTINGS_PATH)


func set_setting(key: String, value: Variant) -> void:
	settings[key] = value
	apply_settings()
	settings_changed.emit()


func get_f(key: String) -> float:
	return float(settings.get(key, DEFAULT_SETTINGS.get(key, 0.0)))


func get_b(key: String) -> bool:
	return bool(settings.get(key, DEFAULT_SETTINGS.get(key, false)))


func apply_settings() -> void:
	_ensure_bus("Music")
	_ensure_bus("SFX")
	AudioServer.set_bus_volume_db(0, linear_to_db(maxf(get_f("master_volume"), 0.0001)))
	AudioServer.set_bus_volume_db(AudioServer.get_bus_index("Music"), linear_to_db(maxf(get_f("music_volume"), 0.0001)))
	AudioServer.set_bus_volume_db(AudioServer.get_bus_index("SFX"), linear_to_db(maxf(get_f("sfx_volume"), 0.0001)))
	if DisplayServer.get_name() != "headless":
		var want_fs := get_b("fullscreen")
		var mode := DisplayServer.window_get_mode()
		var is_fs := mode == DisplayServer.WINDOW_MODE_FULLSCREEN or mode == DisplayServer.WINDOW_MODE_EXCLUSIVE_FULLSCREEN
		if want_fs != is_fs:
			DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_FULLSCREEN if want_fs else DisplayServer.WINDOW_MODE_WINDOWED)


func _ensure_bus(bus_name: String) -> void:
	if AudioServer.get_bus_index(bus_name) == -1:
		AudioServer.add_bus()
		var idx := AudioServer.bus_count - 1
		AudioServer.set_bus_name(idx, bus_name)
		AudioServer.set_bus_send(idx, "Master")


# --------------------------------------------------------------------------
# Progress
# --------------------------------------------------------------------------

func load_progress() -> void:
	progress = {}
	if cmd.has("fresh-progress"):
		return
	var cf := ConfigFile.new()
	if cf.load(PROGRESS_PATH) == OK:
		for m in MISSIONS:
			var id: String = m["id"]
			if cf.has_section(id):
				progress[id] = {
					"completed": bool(cf.get_value(id, "completed", false)),
					"best_score": int(cf.get_value(id, "best_score", 0)),
					"best_grade": str(cf.get_value(id, "best_grade", "")),
					"plays": int(cf.get_value(id, "plays", 0)),
				}


func save_progress() -> void:
	if cmd.has("fresh-progress"):
		return
	var cf := ConfigFile.new()
	for id in progress.keys():
		var p: Dictionary = progress[id]
		for k in p.keys():
			cf.set_value(id, k, p[k])
	cf.save(PROGRESS_PATH)


## Records a finished run. Returns true when it is a new best score.
func record_result(id: String, score: int, grade: String) -> bool:
	var p: Dictionary = progress.get(id, {"completed": false, "best_score": 0, "best_grade": "", "plays": 0})
	p["plays"] = int(p.get("plays", 0)) + 1
	p["completed"] = true
	var best := false
	if score > int(p.get("best_score", 0)) or str(p.get("best_grade", "")) == "":
		p["best_score"] = score
		p["best_grade"] = grade
		best = true
	progress[id] = p
	save_progress()
	return best


func mission_info(id: String) -> Dictionary:
	for m in MISSIONS:
		if m["id"] == id:
			return m
	return {}


func playable_missions() -> Array:
	var out: Array = []
	for m in MISSIONS:
		if m["playable"]:
			out.append(m)
	return out


func is_completed(id: String) -> bool:
	return bool(progress.get(id, {}).get("completed", false))


func is_unlocked(id: String) -> bool:
	if get_b("unlock_all"):
		return true
	var list := playable_missions()
	for i in list.size():
		if list[i]["id"] == id:
			return i == 0 or is_completed(list[i - 1]["id"])
	return false


## The next playable mission after `id`, or an empty dictionary.
func next_mission(id: String) -> Dictionary:
	var list := playable_missions()
	for i in list.size():
		if list[i]["id"] == id and i + 1 < list.size():
			return list[i + 1]
	return {}


## The mission a "Begin Operations" button should start: the first
## unfinished playable mission, or the last one.
func suggested_mission() -> Dictionary:
	var list := playable_missions()
	for m in list:
		if not is_completed(m["id"]):
			return m
	return list[list.size() - 1]
