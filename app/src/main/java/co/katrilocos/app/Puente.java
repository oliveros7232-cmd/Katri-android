package co.katrilocos.app;

import android.Manifest;
import android.app.Activity;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.Normalizer;
import java.util.Set;
import java.util.UUID;

/** Puente entre la página (JavaScript) y el celular: red hacia el PC e impresora Bluetooth. */
public class Puente {
    private static final UUID SPP = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private final Activity act;
    private final WebView web;
    private final SharedPreferences pref;
    private final Object candadoImp = new Object();

    public Puente(Activity a, WebView w) {
        act = a;
        web = w;
        pref = a.getSharedPreferences("katri", Context.MODE_PRIVATE);
    }

    /* ---------- configuración ---------- */
    @JavascriptInterface
    public String servidor() {
        return pref.getString("host", "");
    }

    @JavascriptInterface
    public void fijarServidor(String v) {
        String h = limpiar(v);
        pref.edit().putString("host", h).apply();
    }

    private static String limpiar(String v) {
        if (v == null) return "";
        String h = v.trim().replace("http://", "").replace("https://", "");
        int i = h.indexOf('/');
        if (i >= 0) h = h.substring(0, i);
        return h.replaceAll("[^0-9A-Za-z.:\\-]", "");
    }

    @JavascriptInterface
    public String impresoraActual() {
        return pref.getString("impresora", "");
    }

    @JavascriptInterface
    public void fijarImpresora(String mac) {
        pref.edit().putString("impresora", mac == null ? "" : mac.trim()).apply();
    }

    private boolean permisoBt() {
        return Build.VERSION.SDK_INT < 31 || act.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED;
    }

    @JavascriptInterface
    public String impresoras() {
        JSONObject o = new JSONObject();
        JSONArray lista = new JSONArray();
        try {
            boolean ok = permisoBt();
            o.put("permiso", ok);
            BluetoothAdapter ad = BluetoothAdapter.getDefaultAdapter();
            if (ok && ad != null) {
                Set<BluetoothDevice> set = ad.getBondedDevices();
                if (set != null) for (BluetoothDevice d : set) {
                    JSONObject x = new JSONObject();
                    x.put("nombre", d.getName() == null ? d.getAddress() : d.getName());
                    x.put("mac", d.getAddress());
                    lista.put(x);
                }
            }
            o.put("lista", lista);
        } catch (Exception e) { /* devolver lo que haya */ }
        return o.toString();
    }

    /* ---------- red hacia el PC ---------- */
    @JavascriptInterface
    public void http(final String id, final String metodo, final String path, final String cuerpo, final int limite) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                int status = 0;
                String body = "";
                try {
                    String host = servidor();
                    if (host.isEmpty()) throw new Exception("sin servidor");
                    if (!host.contains(":")) host += ":8080";
                    HttpURLConnection c = (HttpURLConnection) new URL("http://" + host + path).openConnection();
                    c.setConnectTimeout(Math.max(1500, Math.min(limite, 8000)));
                    c.setReadTimeout(Math.max(limite, 3000) + 20000);
                    c.setRequestMethod(metodo);
                    c.setRequestProperty("Content-Type", "application/json");
                    if (cuerpo != null && !cuerpo.isEmpty() && !"GET".equals(metodo)) {
                        c.setDoOutput(true);
                        byte[] d = cuerpo.getBytes("UTF-8");
                        c.setFixedLengthStreamingMode(d.length);
                        OutputStream os = c.getOutputStream();
                        os.write(d);
                        os.close();
                    }
                    status = c.getResponseCode();
                    InputStream in = status >= 400 ? c.getErrorStream() : c.getInputStream();
                    if (in != null) {
                        ByteArrayOutputStream bo = new ByteArrayOutputStream();
                        byte[] buf = new byte[8192];
                        int n;
                        while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
                        in.close();
                        body = bo.toString("UTF-8");
                    }
                    c.disconnect();
                } catch (Exception e) {
                    status = 0;
                    body = "";
                }
                responder("window.__katri.res(" + JSONObject.quote(id) + "," + status + "," + JSONObject.quote(body) + ")");
            }
        }).start();
    }

    private void responder(final String js) {
        act.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                web.evaluateJavascript(js, null);
            }
        });
    }

    /* ---------- impresora Bluetooth ---------- */
    @JavascriptInterface
    public void imprimir(final String id, final String texto, final boolean sinTildes, final int doble) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                boolean ok = false;
                String msg = "";
                synchronized (candadoImp) {
                    BluetoothSocket s = null;
                    try {
                        String mac = impresoraActual();
                        if (mac.isEmpty()) throw new Exception("Elige la impresora en Configuración de la app.");
                        if (!permisoBt()) throw new Exception("Falta el permiso de Bluetooth.");
                        BluetoothAdapter ad = BluetoothAdapter.getDefaultAdapter();
                        if (ad == null || !ad.isEnabled()) throw new Exception("Enciende el Bluetooth del celular.");
                        ad.cancelDiscovery();
                        BluetoothDevice d = ad.getRemoteDevice(mac);
                        String detalle = "";
                        for (int intento = 0; intento < 4 && s == null; intento++) {
                            BluetoothSocket c = null;
                            try {
                                if (intento == 0) c = d.createRfcommSocketToServiceRecord(SPP);
                                else if (intento == 1) c = d.createInsecureRfcommSocketToServiceRecord(SPP);
                                else if (intento == 2) c = (BluetoothSocket) d.getClass().getMethod("createRfcommSocket", int.class).invoke(d, 1);
                                else c = (BluetoothSocket) d.getClass().getMethod("createInsecureRfcommSocket", int.class).invoke(d, 1);
                                c.connect();
                                s = c;
                            } catch (Exception e1) {
                                detalle = e1.getClass().getSimpleName() + ": " + e1.getMessage();
                                try { if (c != null) c.close(); } catch (Exception ign) { /* nada */ }
                                Thread.sleep(700);
                            }
                        }
                        if (s == null) throw new Exception("No se pudo conectar con la impresora (" + detalle + "). Apaga y enciende la impresora, cierra otras apps que la usen y reintenta.");
                        OutputStream os = s.getOutputStream();
                        byte[] datos = escpos(texto, sinTildes, doble);
                        int i = 0;
                        while (i < datos.length) {
                            int n = Math.min(256, datos.length - i);
                            os.write(datos, i, n);
                            i += n;
                            Thread.sleep(30);
                        }
                        os.flush();
                        Thread.sleep(800);
                        ok = true;
                    } catch (Exception e) {
                        String m = e.getMessage();
                        msg = (m != null && m.length() < 260)
                                ? m : "No se pudo conectar con la impresora. Enciéndela y acércala al celular.";
                    } finally {
                        try { if (s != null) s.close(); } catch (Exception ign) { /* nada */ }
                    }
                }
                responder("window.__katri.imp(" + JSONObject.quote(id) + "," + ok + "," + JSONObject.quote(msg) + ")");
            }
        }).start();
    }

    private static String sinTildes(String t) {
        t = t.replace("ñ", "n").replace("Ñ", "N").replace("¿", "").replace("¡", "");
        String n = Normalizer.normalize(t, Normalizer.Form.NFD);
        return n.replaceAll("\\p{M}", "");
    }

    static byte[] escpos(String texto, boolean sinAcentos, int doble) throws Exception {
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        o.write(new byte[]{0x1b, '@'});
        if (!sinAcentos) o.write(new byte[]{0x1b, 't', 19});
        String[] lineas = texto.split("\n", -1);
        for (int n = 0; n < lineas.length; n++) {
            String l = sinAcentos ? sinTildes(lineas[n]) : lineas[n];
            boolean grande = doble >= 0 && n == doble;
            if (grande) o.write(new byte[]{0x1d, '!', 0x11});
            if (n == 0) o.write(new byte[]{0x1b, 'E', 1});
            o.write(l.getBytes(sinAcentos ? "US-ASCII" : "IBM850"));
            o.write('\n');
            if (grande) o.write(new byte[]{0x1d, '!', 0x00});
            if (n == 0) o.write(new byte[]{0x1b, 'E', 0});
        }
        o.write(new byte[]{0x1b, 'd', 4});
        o.write(new byte[]{0x1d, 'V', 0x42, 0x00});
        return o.toByteArray();
    }
}
