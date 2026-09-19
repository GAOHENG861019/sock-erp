package com.sock.erp;

import android.content.Context;
import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import java.io.File;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 必须在 super.onCreate（创建 WebView、加载 bundle）之前清理旧的
        // PWA Service Worker。旧 workbox SW 会拦截导航并返回缓存的旧 index.html/
        // 旧 chunk，导致 Capgo 热更新或整包覆盖安装后，手机仍跑旧代码
        //（表现为原材料采购点击“添加/保存”无反应、前端版本号不变等）。
        purgeServiceWorkerStorage(getApplicationContext());
        registerPlugin(AppUpdatePlugin.class);
        super.onCreate(savedInstanceState);
        // WebView 创建后再清空磁盘 HTTP 缓存（旧 index.html 等）。
        // clearCache(true) 只清 HTTP 缓存，不会删除 localStorage / IndexedDB / Cookie。
        try {
            if (bridge != null && bridge.getWebView() != null) {
                bridge.getWebView().clearCache(true);
            }
        } catch (Throwable ignored) {
            // 清理失败不影响启动
        }
    }

    /**
     * 删除 WebView 数据目录下所有 Service Worker 与 CacheStorage 目录。
     * 不同 Chromium / WebView 版本的目录布局不同：
     *   app_webview/Service Worker/...
     *   app_webview/Default/Service Worker/...
     * 因此递归遍历，删除任意层级下同名目录，避免写死单一路径漏删。
     *
     * 只清理 SW 与 Cache API 缓存（workbox precache 位于 Service Worker/CacheStorage），
     * 不触碰 Local Storage / IndexedDB / Cookies —— 业务数据在 Local Storage 且云端有备份。
     */
    private void purgeServiceWorkerStorage(Context context) {
        try {
            File webRoot = new File(context.getDataDir(), "app_webview");
            deleteNamedDirectories(webRoot, "Service Worker");
            deleteNamedDirectories(webRoot, "CacheStorage");
        } catch (Throwable ignored) {
            // 清理失败不影响启动
        }
    }

    /** 递归删除 root 下所有名为 name 的目录（名称大小写不敏感）。 */
    private void deleteNamedDirectories(File dir, String name) {
        if (dir == null || !dir.exists() || !dir.isDirectory()) return;
        File[] children = dir.listFiles();
        if (children == null) return;
        for (File child : children) {
            if (child.isDirectory()) {
                if (child.getName().equalsIgnoreCase(name)) {
                    deleteRecursive(child);
                } else {
                    deleteNamedDirectories(child, name);
                }
            }
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
