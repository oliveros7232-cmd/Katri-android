package co.katrilocos.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.text.InputType;
import android.view.KeyEvent;
import android.view.ViewGroup;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;

import androidx.webkit.WebViewAssetLoader;

import java.io.IOException;
import java.io.InputStream;

public class MainActivity extends Activity {
    private WebView web;
    private Puente puente;
    private static final String INICIO = "https://appassets.androidplatform.net/mesero";

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .setDomain("appassets.androidplatform.net")
                .addPathHandler("/", new WebViewAssetLoader.PathHandler() {
                    @Override
                    public WebResourceResponse handle(String path) {
                        return servir(path);
                    }
                })
                .build();

        web = new WebView(this);
        web.setLayoutParams(new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);

        puente = new Puente(this, web);
        web.addJavascriptInterface(puente, "KatriNative");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                return loader.shouldInterceptRequest(r.getUrl());
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage m) {
                android.util.Log.d("Katri", m.message() + " (" + m.sourceId() + ":" + m.lineNumber() + ")");
                return true;
            }
        });

        pedirPermisoBluetooth();
        web.loadUrl(INICIO);
        if (puente.servidor().isEmpty()) preguntarServidor();
    }

    /** Sirve los archivos que van dentro de la app. */
    private WebResourceResponse servir(String path) {
        while (path.startsWith("/")) path = path.substring(1);
        String ruta;
        if (path.equals("mesero") || path.equals("mesero/") || path.isEmpty()) ruta = "static/index.html";
        else if (path.equals("logo.png") || path.equals("manifest.webmanifest")) ruta = "static/" + path;
        else if (path.startsWith("static/") || path.startsWith("py/")) ruta = path;
        else return new WebResourceResponse("text/plain", "utf-8", 404, "No encontrado", null, null);
        if (ruta.contains("..")) return null;
        try {
            InputStream in = getAssets().open(ruta);
            WebResourceResponse r = new WebResourceResponse(tipo(ruta), tipo(ruta).startsWith("text/") || ruta.endsWith(".js") || ruta.endsWith(".json") ? "utf-8" : null, in);
            java.util.Map<String, String> h = new java.util.HashMap<>();
            h.put("Cache-Control", "no-cache");
            h.put("Access-Control-Allow-Origin", "*");
            r.setResponseHeaders(h);
            return r;
        } catch (IOException e) {
            return new WebResourceResponse("text/plain", "utf-8", 404, "No encontrado", null, null);
        }
    }

    private static String tipo(String r) {
        String x = r.toLowerCase();
        if (x.endsWith(".html")) return "text/html";
        if (x.endsWith(".js")) return "application/javascript";
        if (x.endsWith(".css")) return "text/css";
        if (x.endsWith(".json") || x.endsWith(".webmanifest")) return "application/json";
        if (x.endsWith(".wasm")) return "application/wasm";
        if (x.endsWith(".png")) return "image/png";
        if (x.endsWith(".zip") || x.endsWith(".whl")) return "application/zip";
        if (x.endsWith(".py")) return "text/plain";
        return "application/octet-stream";
    }

    private void pedirPermisoBluetooth() {
        if (Build.VERSION.SDK_INT >= 31 && checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.BLUETOOTH_CONNECT}, 7);
        }
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] p, int[] r) {
        super.onRequestPermissionsResult(code, p, r);
        if (web != null) web.reload();
    }

    private void preguntarServidor() {
        final EditText et = new EditText(this);
        et.setHint("192.168.110.138");
        et.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        new AlertDialog.Builder(this)
                .setTitle("Dirección del PC del restaurante")
                .setMessage("Escribe la dirección que aparece en Configuración del programa del PC (solo números, ej. 192.168.1.20). Se pide una sola vez.")
                .setView(et)
                .setCancelable(false)
                .setPositiveButton("Guardar", (d, w) -> {
                    puente.fijarServidor(et.getText().toString());
                    web.reload();
                })
                .setNegativeButton("Después", null)
                .show();
    }

    @Override
    public boolean onKeyDown(int k, KeyEvent e) {
        if (k == KeyEvent.KEYCODE_BACK) {
            moveTaskToBack(true);
            return true;
        }
        return super.onKeyDown(k, e);
    }
}
