package com.mdmeta.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BrowserLauncherPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
