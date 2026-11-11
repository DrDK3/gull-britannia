extends RefCounted
## Shared UI look: Cold War dossier palette, typewriter and serif system fonts
## (falling back to Godot's default font when unavailable).

const C_TEXT := Color(0.95, 0.92, 0.84)
const C_DIM := Color(0.66, 0.66, 0.64)
const C_ACCENT := Color(0.93, 0.36, 0.28)
const C_BAD := Color(1.0, 0.3, 0.25)
const C_GOOD := Color(0.55, 0.9, 0.55)
const C_PAPER := Color(0.92, 0.88, 0.77)
const C_INK := Color(0.13, 0.12, 0.11)
const C_STAMP := Color(0.72, 0.1, 0.08)
const C_BG := Color(0.035, 0.05, 0.075)

static var _theme: Theme
static var _mono: Font
static var _serif: Font


static func mono() -> Font:
	if _mono == null:
		var f := SystemFont.new()
		f.font_names = PackedStringArray(["Courier Prime", "Courier New", "Courier", "Nimbus Mono PS", "Liberation Mono", "DejaVu Sans Mono", "monospace"])
		_mono = f
	return _mono


static func serif() -> Font:
	if _serif == null:
		var f := SystemFont.new()
		f.font_names = PackedStringArray(["Georgia", "Times New Roman", "Liberation Serif", "Nimbus Roman", "DejaVu Serif", "serif"])
		f.font_weight = 700
		_serif = f
	return _serif


static func _box(bg: Color, border: Color, bw := 1, radius := 2, pad := 10) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = bg
	s.border_color = border
	s.set_border_width_all(bw)
	s.set_corner_radius_all(radius)
	s.content_margin_left = pad + 4
	s.content_margin_right = pad + 4
	s.content_margin_top = pad
	s.content_margin_bottom = pad
	return s


static func theme() -> Theme:
	if _theme != null:
		return _theme
	var t := Theme.new()
	t.default_font_size = 16
	t.set_color("font_color", "Label", C_TEXT)
	t.set_stylebox("panel", "PanelContainer", _box(Color(0.04, 0.06, 0.09, 0.8), Color(1, 1, 1, 0.08), 1, 3, 10))
	t.set_stylebox("normal", "Button", _box(Color(0.10, 0.12, 0.15, 0.95), Color(0.85, 0.8, 0.7, 0.35), 1, 2, 8))
	t.set_stylebox("hover", "Button", _box(Color(0.42, 0.1, 0.08, 0.98), Color(0.95, 0.5, 0.4, 0.8), 1, 2, 8))
	t.set_stylebox("pressed", "Button", _box(Color(0.6, 0.12, 0.1, 1.0), Color(1, 0.7, 0.6, 1.0), 1, 2, 8))
	t.set_stylebox("focus", "Button", _box(Color(0, 0, 0, 0), Color(1.0, 0.85, 0.5, 0.9), 2, 2, 8))
	t.set_stylebox("disabled", "Button", _box(Color(0.08, 0.09, 0.1, 0.8), Color(1, 1, 1, 0.08), 1, 2, 8))
	t.set_color("font_color", "Button", C_TEXT)
	t.set_color("font_hover_color", "Button", Color(1, 1, 1))
	t.set_color("font_disabled_color", "Button", Color(0.45, 0.45, 0.45))
	t.set_font_size("font_size", "Button", 18)
	t.set_color("font_color", "CheckBox", C_TEXT)
	t.set_color("font_hover_color", "CheckBox", Color(1, 0.9, 0.7))
	_theme = t
	return t


static func panel(bg: Color) -> PanelContainer:
	var p := PanelContainer.new()
	p.add_theme_stylebox_override("panel", _box(bg, Color(1, 1, 1, 0.07), 1, 3, 10))
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return p


static func paper_panel() -> PanelContainer:
	var p := PanelContainer.new()
	var s := _box(C_PAPER, Color(0.55, 0.5, 0.4), 2, 1, 26)
	s.shadow_color = Color(0, 0, 0, 0.5)
	s.shadow_size = 14
	p.add_theme_stylebox_override("panel", s)
	return p


static func label(text: String, size := 16, color := C_TEXT, font: Font = null) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	if font != null:
		l.add_theme_font_override("font", font)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l


static func button(text: String, cb: Callable, min_w := 280.0) -> Button:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = Vector2(min_w, 42)
	b.pressed.connect(func():
		Sfx.play("click", -6.0)
		cb.call())
	return b
