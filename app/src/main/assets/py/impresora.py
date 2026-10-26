# -*- coding: utf-8 -*-
"""Impresión de comandas en la impresora térmica de 58 mm (ESC/POS) conectada al PC.

Funciona por puerto COM (Bluetooth emparejado en Windows o cable USB que crea un COM).
No necesita librerías extra: escribe directo al puerto.
"""
import os
import threading
import time
import unicodedata

_candado = threading.Lock()
_ctx = threading.local()
DESHABILITADA = False  # True en el celular (sin impresora)
ESC, GS = b"\x1b", b"\x1d"


def listar_puertos():
    """Puertos COM que Windows tiene disponibles (los de Bluetooth aparecen al emparejar)."""
    puertos = []
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"HARDWARE\DEVICEMAP\SERIALCOMM") as k:
            i = 0
            while True:
                try:
                    nombre, valor, _ = winreg.EnumValue(k, i)
                except OSError:
                    break
                tipo = "Bluetooth" if "bth" in nombre.lower() else ("USB" if "usb" in nombre.lower() else "")
                puertos.append({"puerto": str(valor), "tipo": tipo})
                i += 1
    except Exception:
        pass
    puertos.sort(key=lambda x: (len(x["puerto"]), x["puerto"]))
    return puertos


def _sin_tildes(t):
    t = t.replace("ñ", "n").replace("Ñ", "N").replace("¿", "").replace("¡", "")
    return "".join(ch for ch in unicodedata.normalize("NFD", t) if unicodedata.category(ch) != "Mn")


def a_escpos(texto, sin_tildes=True, doble_linea=None):
    """Convierte la comanda en bytes ESC/POS. doble_linea: número de línea que sale en letra grande."""
    out = bytearray(ESC + b"@")
    if not sin_tildes:
        out += ESC + b"t" + bytes([19])  # página de códigos CP858 (acentos en español)
    for n, linea in enumerate(texto.split("\n")):
        if sin_tildes:
            linea = _sin_tildes(linea)
        grande = doble_linea is not None and n == doble_linea
        if grande:
            out += GS + b"!" + bytes([0x11])
        if n == 0:
            out += ESC + b"E" + b"\x01"
        out += linea.encode("cp858" if not sin_tildes else "ascii", "replace") + b"\n"
        if grande:
            out += GS + b"!" + b"\x00"
        if n == 0:
            out += ESC + b"E" + b"\x00"
    out += ESC + b"d" + bytes([4])  # avanzar papel
    out += GS + b"V" + b"\x42" + b"\x00"  # corte (si la impresora lo tiene)
    return bytes(out)


def _ruta_puerto(puerto):
    puerto = puerto.strip()
    if os.name == "nt" and puerto.upper().startswith("COM"):
        return "\\\\.\\" + puerto.upper()
    return puerto


def _escribir_serial(puerto, datos):
    import serial  # pyserial
    sp = serial.Serial(puerto.strip().upper(), 9600, timeout=2, write_timeout=10)
    try:
        sp.write(datos)
        sp.flush()
        time.sleep(0.5)  # dejar que termine de salir por Bluetooth
    finally:
        sp.close()


def _escribir_directo(puerto, datos):
    ruta = _ruta_puerto(puerto)
    flags = os.O_WRONLY | getattr(os, "O_BINARY", 0)
    if os.name != "nt":
        flags |= os.O_CREAT  # solo para pruebas fuera de Windows (archivo)
    try:
        fd = os.open(ruta, flags)
    except PermissionError:
        if os.name != "nt":
            raise
        fd = os.open(ruta, (flags & ~os.O_WRONLY) | os.O_RDWR)
    try:
        enviado = 0
        while enviado < len(datos):
            enviado += os.write(fd, datos[enviado:enviado + 512])
    finally:
        os.close(fd)


def _escribir(puerto, datos, resultado):
    try:
        try:
            import serial  # noqa: F401
            usa_serial = os.name == "nt" and puerto.strip().upper().startswith("COM")
        except ImportError:
            usa_serial = False
        if usa_serial:
            _escribir_serial(puerto, datos)
        else:
            _escribir_directo(puerto, datos)
        resultado["ok"] = True
    except FileNotFoundError:
        resultado["error"] = "No existe el puerto %s. Revisa que la impresora esté encendida y emparejada." % puerto
    except Exception as e:
        resultado["error"] = "No se pudo imprimir por %s: %s" % (puerto, str(e)[:220])


def imprimir(cfg, texto, doble_linea=None):
    """Devuelve {"ok": bool, "error": str|None, "sin_impresora": bool}."""
    if DESHABILITADA:
        return {"ok": False, "offline": True, "error": "Sin conexión con el PC: el pedido se enviará al PC cuando vuelva la conexión."}
    if getattr(_ctx, "omitir", False):
        return {"ok": False, "omitido": True, "error": "Pedido sincronizado tarde: no se imprimió en cocina."}
    puerto = (cfg.get("impresora_puerto") or "").strip()
    if not puerto:
        return {"ok": False, "sin_impresora": True, "error": "No hay impresora configurada en el PC."}
    sin_tildes = str(cfg.get("impresora_sin_tildes", "1")) != "0"
    datos = a_escpos(texto, sin_tildes, doble_linea)
    res = {}
    with _candado:  # una impresión a la vez
        hilo = threading.Thread(target=_escribir, args=(puerto, datos, res), daemon=True)
        hilo.start()
        hilo.join(12)
    if hilo.is_alive():
        return {"ok": False, "error": "La impresora no responde. Enciéndela y acércala al PC."}
    if res.get("ok"):
        return {"ok": True}
    return {"ok": False, "error": res.get("error") or "Error desconocido al imprimir."}


def texto_prueba(negocio, ancho=32):
    return "\n".join([
        "PRUEBA DE IMPRESION".center(ancho),
        "=" * ancho,
        (negocio or "Katri Locos").center(ancho),
        "Acentos: áéíóú ñ ¿? ¡!",
        "-" * ancho,
        "Si lees esto, la impresora",
        "quedo bien configurada.",
        "=" * ancho,
    ])
