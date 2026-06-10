package com.mdmeta.app;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Opens an https URL in Firefox for Android by pinning the VIEW intent to
 * Firefox's package. The firefox://open?url= deep-link scheme is unreliable
 * (some Fenix builds silently ignore it, and Capacitor swallows the
 * ActivityNotFoundException), whereas a package-pinned intent is the same
 * mechanism as the system "Open with → Firefox" action and reports failure.
 */
@CapacitorPlugin(name = "BrowserLauncher")
public class BrowserLauncherPlugin extends Plugin {

    // Release, Beta, Nightly — first installed build wins.
    private static final String[] FIREFOX_PACKAGES = {
        "org.mozilla.firefox",
        "org.mozilla.firefox_beta",
        "org.mozilla.fenix"
    };

    @PluginMethod
    public void openInFirefox(PluginCall call) {
        String url = call.getString("url");
        if (url == null) {
            call.reject("url is required");
            return;
        }

        JSObject ret = new JSObject();
        for (String pkg : FIREFOX_PACKAGES) {
            if (launch(url, pkg)) {
                ret.put("browser", "firefox");
                call.resolve(ret);
                return;
            }
        }

        // No Firefox installed — fall back to the default browser so the
        // user at least lands on the page, and report it so the UI can say so.
        ret.put("browser", launch(url, null) ? "default" : "none");
        call.resolve(ret);
    }

    private boolean launch(String url, String pkg) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (pkg != null) {
            intent.setPackage(pkg);
        }
        try {
            getActivity().startActivity(intent);
            return true;
        } catch (ActivityNotFoundException e) {
            return false;
        }
    }
}
