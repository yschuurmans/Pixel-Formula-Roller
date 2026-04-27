package com.youri.pixelformularoller;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
	@Override
	public void onCreate(android.os.Bundle savedInstanceState) {
		registerPlugin(PixelsBlePlugin.class);
		super.onCreate(savedInstanceState);
	}
}
