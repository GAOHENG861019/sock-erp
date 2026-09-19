package com.sock.erp;

import android.content.Context;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebStorage;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import java.io.File;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppUpdatePlugin.class);
        super.onCreate(savedInstanceState);
        // 覆盖安装旧版（<=1.3.0）时，WebView 里固化了旧的 PWA Service Worker，
        // 它会拦截导航并返回缓存的旧页面，导致新代码永远不生效（例如原材料添加无反应）。
        // 应用启动时在 WebView 初始化前清掉 SW 存储：卸载旧 SW、清空其 CacheStorage，
        // 不影响 localStorage（用户业务数据在 Local Storage 目录，不在此清理范围）。
        cleanupServiceWorkerStorage(getApplicationContext());
    }

    private void cleanupServiceWorkerStorage(Context context) {
        try {
            File swRoot = new File(context.getDataDir(), "app_webview/Service Worker");
            if (swRoot.exists()) {
                deleteRecursive(swRoot);
            }
        } catch (Throwable ignored) {
            // 清理失败不影响启动
        }
        try {
            // 触发 WebView 初始化后再清理 HTTP 缓存，确保旧缓存资源不会残留
            WebView webView = new WebView(context);
            webView.clearCache(true);
            webView.destroy();
        } catch (Throwable ignored) {
        }
        try {
            CookieManager.getInstance().removeAllCookies(null);
            CookieManager.getInstance().flush();
        } catch (Throwable ignored) {
        }
        try {
            // 仅清 Web SQL/IndexedDB 等 WebView 数据，不触碰 localStorage
            WebStorage.getInstance().deleteAllData();
        } catch (Throwable ignored) {
        }
    }

    private static void deleteRecursive(File file) {
        if (file == null || !file.exists()) return;
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) {
                for (File child : children) deleteRecursive(child);
            }
        }
        file.delete();
    }
}
