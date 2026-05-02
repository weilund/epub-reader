package com.epub.reader;

import com.getcapacitor.BridgeActivity;
import android.view.KeyEvent;

public class MainActivity extends BridgeActivity {
    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_VOLUME_DOWN) {
            // 音量下 → 下一页
            bridge.triggerWindowJSEvent("volumedown");
            return true;
        } else if (keyCode == KeyEvent.KEYCODE_VOLUME_UP) {
            // 音量上 → 上一页
            bridge.triggerWindowJSEvent("volumeup");
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }
}
