package com.youri.pixelformularoller;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.AlertDialog;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanFilter;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelUuid;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

@CapacitorPlugin(
    name = "PixelsBle",
    permissions = {
        @Permission(alias = "bluetoothScan", strings = { Manifest.permission.BLUETOOTH_SCAN }),
        @Permission(alias = "bluetoothConnect", strings = { Manifest.permission.BLUETOOTH_CONNECT }),
        @Permission(alias = "location", strings = { Manifest.permission.ACCESS_FINE_LOCATION })
    }
)
public class PixelsBlePlugin extends Plugin {
    private static final String TAG = "PixelsBle";
    private static final UUID LEGACY_SERVICE_UUID = UUID.fromString("6e400001-b5a3-f393-e0a9-e50e24dcca9e");
    private static final UUID LEGACY_NOTIFY_UUID = UUID.fromString("6e400001-b5a3-f393-e0a9-e50e24dcca9e");
    private static final UUID LEGACY_WRITE_UUID = UUID.fromString("6e400002-b5a3-f393-e0a9-e50e24dcca9e");
    private static final UUID MODERN_SERVICE_UUID = UUID.fromString("a6b90001-7a5a-43f2-a962-350c8edc9b5b");
    private static final UUID MODERN_NOTIFY_UUID = UUID.fromString("a6b90002-7a5a-43f2-a962-350c8edc9b5b");
    private static final UUID MODERN_WRITE_UUID = UUID.fromString("a6b90003-7a5a-43f2-a962-350c8edc9b5b");
    private static final UUID CLIENT_CHARACTERISTIC_CONFIG_UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");
    private static final long SCAN_WINDOW_MS = 5000L;
    private static final int DESIRED_MTU = 64;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final Map<String, BluetoothDevice> knownDevices = new LinkedHashMap<>();
    private final Map<String, DeviceSession> sessions = new LinkedHashMap<>();
    private boolean requestPixelPending = false;

    @PluginMethod
    public void getAvailability(PluginCall call) {
        JSObject result = new JSObject();
        BluetoothAdapter adapter = getBluetoothAdapter();
        boolean available = adapter != null;
        boolean bluetoothEnabled = available && adapter.isEnabled();
        boolean permissionsGranted = hasRuntimePermissions();
        result.put("available", available && bluetoothEnabled);
        result.put("bluetoothEnabled", bluetoothEnabled);
        result.put("permissionsGranted", permissionsGranted);

        JSArray missingPermissions = new JSArray();
        for (String permission : getMissingPermissionNames()) {
            missingPermissions.put(permission);
        }
        result.put("missingPermissions", missingPermissions);
        call.resolve(result);
    }

    @PluginMethod
    public void requestPixels(PluginCall call) {
        if (!ensureReadyForBle(call, true)) {
            return;
        }

        startPickerScan(call);
    }

    @PluginMethod
    public void getPixel(PluginCall call) {
        BluetoothAdapter adapter = getBluetoothAdapter();
        String systemId = call.getString("systemId");
        if (adapter == null) {
          call.resolve();
          return;
        }

        if (systemId == null || systemId.isEmpty()) {
            call.reject("Missing systemId.");
            return;
        }

        BluetoothDevice known = knownDevices.get(systemId);
        if (known != null) {
            call.resolve(toDeviceResult(known));
            return;
        }

        try {
            BluetoothDevice remote = adapter.getRemoteDevice(systemId);
            knownDevices.put(systemId, remote);
            call.resolve(toDeviceResult(remote));
        } catch (IllegalArgumentException error) {
            call.resolve();
        }
    }

    @PluginMethod
    public void connect(PluginCall call) {
        if (!ensureReadyForBle(call, false)) {
            return;
        }

        String systemId = call.getString("systemId");
        if (systemId == null || systemId.isEmpty()) {
            call.reject("Missing systemId.");
            return;
        }

        BluetoothDevice device = getKnownOrRemoteDevice(systemId);
        if (device == null) {
            call.reject("No known Bluetooth device with system id: " + systemId);
            return;
        }

        knownDevices.put(systemId, device);
        DeviceSession existing = sessions.get(systemId);
        if (existing != null && existing.isReady()) {
            call.resolve(toDeviceResult(device));
            return;
        }

        if (existing != null) {
            existing.close();
            sessions.remove(systemId);
        }

        DeviceSession session = new DeviceSession(device, call, getContext());
        sessions.put(systemId, session);
        session.connect(call.getInt("timeoutMs", 6000));
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        String systemId = call.getString("systemId");
        if (systemId == null || systemId.isEmpty()) {
            call.reject("Missing systemId.");
            return;
        }

        DeviceSession session = sessions.remove(systemId);
        if (session != null) {
            session.close();
        }

        call.resolve();
    }

    @PluginMethod
    public void writeValue(PluginCall call) {
        String systemId = call.getString("systemId");
        if (systemId == null || systemId.isEmpty()) {
            call.reject("Missing systemId.");
            return;
        }

        DeviceSession session = sessions.get(systemId);
        if (session == null || !session.isReady()) {
            call.reject("Not connected.");
            return;
        }

        JSArray rawValue = call.getArray("value");
        if (rawValue == null) {
            call.reject("Missing value.");
            return;
        }

        byte[] value = new byte[rawValue.length()];
        for (int index = 0; index < rawValue.length(); index += 1) {
            value[index] = (byte) rawValue.optInt(index);
        }

        boolean withoutResponse = call.getBoolean("withoutResponse", false);
        try {
            session.writeValue(value, withoutResponse);
            call.resolve();
        } catch (IllegalStateException error) {
            call.reject(error.getMessage());
        }
    }

    @PermissionCallback
    private void onBlePermissionResult(PluginCall call) {
        if (!hasRuntimePermissions()) {
            call.reject("Bluetooth permission denied. Tap 'Connect' to try again.");
            return;
        }

        if (requestPixelPending) {
            requestPixelPending = false;
            startPickerScan(call);
        }
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        for (DeviceSession session : sessions.values()) {
            session.close();
        }
        sessions.clear();
    }

    private boolean ensureReadyForBle(PluginCall call, boolean continueWithPicker) {
        BluetoothAdapter adapter = getBluetoothAdapter();
        if (adapter == null) {
            call.reject("Bluetooth is unavailable on this device.");
            return false;
        }

        if (!adapter.isEnabled()) {
            call.reject("Bluetooth is turned off. Enable it and try again.");
            return false;
        }

        if (!hasRuntimePermissions()) {
            requestPixelPending = continueWithPicker;
            requestPermissionForAliases(getRequiredPermissionAliases(), call, "onBlePermissionResult");
            return false;
        }

        return true;
    }

    private void startPickerScan(PluginCall call) {
        BluetoothLeScanner scanner = getBluetoothLeScanner();
        if (scanner == null) {
            Log.w(TAG, "BLE scanner unavailable");
            call.reject("Bluetooth LE scanner is unavailable.");
            return;
        }

        LinkedHashMap<String, BluetoothDevice> likelyResults = new LinkedHashMap<>();
        LinkedHashMap<String, BluetoothDevice> fallbackResults = new LinkedHashMap<>();
        Log.i(TAG, "Starting BLE picker scan");
        ScanCallback callback = new ScanCallback() {
            private void recordCandidate(ScanResult result) {
                BluetoothDevice device = result.getDevice();
                if (device == null || device.getAddress() == null || !isBleCandidate(device)) {
                    return;
                }

                knownDevices.put(device.getAddress(), device);
                boolean likelyPixel = isLikelyPixel(result, device);
                Log.i(
                    TAG,
                    "Scan candidate address=" + device.getAddress()
                        + " name='" + safeDeviceName(device) + "'"
                        + " rssi=" + result.getRssi()
                        + " hasPixelsService=" + advertisesPixelsService(result)
                        + " likelyPixel=" + likelyPixel
                );
                if (likelyPixel) {
                    likelyResults.put(device.getAddress(), device);
                    return;
                }

                fallbackResults.put(device.getAddress(), device);
            }

            @Override
            public void onScanResult(int callbackType, ScanResult result) {
                recordCandidate(result);
            }

            @Override
            public void onBatchScanResults(List<ScanResult> results) {
                for (ScanResult result : results) {
                    recordCandidate(result);
                }
            }

            @Override
            public void onScanFailed(int errorCode) {
                scanner.stopScan(this);
                Log.w(TAG, "BLE scan failed errorCode=" + errorCode);
                call.reject("Bluetooth scan failed (" + errorCode + ").");
            }
        };

        ScanSettings settings = new ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .build();

        scanner.startScan(null, settings, callback);
        mainHandler.postDelayed(() -> {
            scanner.stopScan(callback);
            List<BluetoothDevice> devices = !likelyResults.isEmpty()
                ? new ArrayList<>(likelyResults.values())
                : new ArrayList<>(fallbackResults.values());
            Log.i(
                TAG,
                "BLE picker scan finished likely=" + likelyResults.size()
                    + " fallback=" + fallbackResults.size()
                    + " presenting=" + devices.size()
            );
            resolveDiscoveredPixels(call, devices);
        }, SCAN_WINDOW_MS);
    }

    private boolean isBleCandidate(BluetoothDevice device) {
        return device.getType() != BluetoothDevice.DEVICE_TYPE_CLASSIC;
    }

    private boolean isLikelyPixel(ScanResult result, BluetoothDevice device) {
        if (advertisesPixelsService(result)) {
            return true;
        }

        String name = getDeviceName(device).toLowerCase(Locale.US);
        return name.contains("pixel") || name.contains("pxl");
    }

    private boolean advertisesPixelsService(ScanResult result) {
        if (result.getScanRecord() == null || result.getScanRecord().getServiceUuids() == null) {
            return false;
        }

        for (ParcelUuid serviceUuid : result.getScanRecord().getServiceUuids()) {
            UUID uuid = serviceUuid.getUuid();
            if (LEGACY_SERVICE_UUID.equals(uuid) || MODERN_SERVICE_UUID.equals(uuid)) {
                return true;
            }
        }

        return false;
    }

    private JSObject toDeviceResult(BluetoothDevice device) {
        JSObject result = new JSObject();
        result.put("systemId", device.getAddress());
        result.put("name", safeDeviceName(device));
        return result;
    }

    private BluetoothAdapter getBluetoothAdapter() {
        BluetoothManager manager = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        return manager != null ? manager.getAdapter() : null;
    }

    private BluetoothLeScanner getBluetoothLeScanner() {
        BluetoothAdapter adapter = getBluetoothAdapter();
        return adapter != null ? adapter.getBluetoothLeScanner() : null;
    }

    private boolean hasRuntimePermissions() {
        for (String permission : getMissingPermissionNames()) {
            if (ContextCompat.checkSelfPermission(getContext(), permission) != PackageManager.PERMISSION_GRANTED) {
                return false;
            }
        }
        return true;
    }

    private String[] getMissingPermissionNames() {
        List<String> permissions = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            permissions.add(Manifest.permission.BLUETOOTH_SCAN);
            permissions.add(Manifest.permission.BLUETOOTH_CONNECT);
        }
        permissions.add(Manifest.permission.ACCESS_FINE_LOCATION);
        return permissions.toArray(new String[0]);
    }

    private String[] getRequiredPermissionAliases() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return new String[] { "bluetoothScan", "bluetoothConnect", "location" };
        }
        return new String[] { "location" };
    }

    @SuppressLint("MissingPermission")
    private BluetoothDevice getKnownOrRemoteDevice(String systemId) {
        BluetoothDevice known = knownDevices.get(systemId);
        if (known != null) {
            return known;
        }

        BluetoothAdapter adapter = getBluetoothAdapter();
        if (adapter == null) {
            return null;
        }

        try {
            return adapter.getRemoteDevice(systemId);
        } catch (IllegalArgumentException error) {
            return null;
        }
    }

    private void resolveDiscoveredPixels(PluginCall call, List<BluetoothDevice> devices) {
        if (devices.isEmpty()) {
            Log.i(TAG, "No BLE devices qualified for auto-connect");
            call.reject("No Pixels dice were found nearby.");
            return;
        }

        JSArray results = new JSArray();
        for (BluetoothDevice device : devices) {
            knownDevices.put(device.getAddress(), device);
            Log.i(TAG, "Queueing discovered Pixels device address=" + device.getAddress() + " name='" + safeDeviceName(device) + "'");
            results.put(toDeviceResult(device));
        }

        Log.i(TAG, "Returning " + devices.size() + " discovered Pixels devices without prompting");
        JSObject payload = new JSObject();
        payload.put("devices", results);
        call.resolve(payload);
    }

    private String summarizeBytes(byte[] value) {
        if (value == null || value.length == 0) {
            return "";
        }

        StringBuilder builder = new StringBuilder();
        int maxLength = Math.min(value.length, 12);
        for (int index = 0; index < maxLength; index += 1) {
            if (index > 0) {
                builder.append(' ');
            }
            builder.append(String.format(Locale.US, "%02X", value[index] & 0xff));
        }
        if (value.length > maxLength) {
            builder.append(" ...");
        }
        return builder.toString();
    }

    private void emitNotification(String systemId, byte[] value) {
        JSArray bytes = new JSArray();
        if (value != null) {
            for (byte item : value) {
                bytes.put(item & 0xff);
            }
        }

        JSObject payload = new JSObject();
        payload.put("systemId", systemId);
        payload.put("value", bytes);
        notifyListeners("pixelsBleNotification", payload);
    }

    private void emitDisconnect(String systemId) {
        JSObject payload = new JSObject();
        payload.put("systemId", systemId);
        notifyListeners("pixelsBleDisconnect", payload);
    }

    private String safeDeviceName(BluetoothDevice device) {
        String name = getDeviceName(device);
        if (name == null || name.isEmpty()) {
            return "Pixel";
        }
        return name;
    }

    private String getDeviceName(BluetoothDevice device) {
        String name = device.getName();
        if (name == null || name.isEmpty()) {
            return "";
        }
        return new String(name.getBytes(StandardCharsets.UTF_8), StandardCharsets.UTF_8);
    }

    private String abbreviateAddress(String address) {
        if (address == null || address.length() < 5) {
            return address;
        }
        return address.substring(Math.max(0, address.length() - 5)).toUpperCase(Locale.US);
    }

    private final class DeviceSession {
        private final BluetoothDevice device;
        private final PluginCall connectCall;
        private final Context context;
        private BluetoothGatt gatt;
        private BluetoothGattCharacteristic notifyCharacteristic;
        private BluetoothGattCharacteristic writeCharacteristic;
        private boolean ready;
        private boolean connectResultDelivered;
        private Runnable timeoutRunnable;

        DeviceSession(BluetoothDevice device, PluginCall connectCall, Context context) {
            this.device = device;
            this.connectCall = connectCall;
            this.context = context;
        }

        @SuppressLint("MissingPermission")
        void connect(int timeoutMs) {
            Log.i(TAG, "Connecting to device address=" + device.getAddress() + " name='" + safeDeviceName(device) + "' timeoutMs=" + timeoutMs);
            timeoutRunnable = () -> {
                if (!connectResultDelivered) {
                    Log.w(TAG, "Connection timed out address=" + device.getAddress());
                    connectResultDelivered = true;
                    close();
                    connectCall.reject("Connection timeout");
                }
            };
            mainHandler.postDelayed(timeoutRunnable, Math.max(timeoutMs, 1000));
            gatt = device.connectGatt(context, false, callback, BluetoothDevice.TRANSPORT_LE);
            if (gatt == null) {
                clearTimeout();
                connectResultDelivered = true;
                connectCall.reject("Bluetooth GATT connection could not be created.");
            }
        }

        boolean isReady() {
            return ready && gatt != null && writeCharacteristic != null;
        }

        @SuppressLint("MissingPermission")
        void writeValue(byte[] value, boolean withoutResponse) {
            if (!isReady() || writeCharacteristic == null || gatt == null) {
                throw new IllegalStateException("Not connected.");
            }

            writeCharacteristic.setWriteType(
                withoutResponse
                    ? BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
                    : BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
            );
            writeCharacteristic.setValue(value);
            Log.i(
                TAG,
                "Writing BLE value address=" + device.getAddress()
                    + " withoutResponse=" + withoutResponse
                    + " bytes=" + summarizeBytes(value)
            );
            boolean started = gatt.writeCharacteristic(writeCharacteristic);
            if (!started) {
                throw new IllegalStateException("Bluetooth write failed to start.");
            }
        }

        @SuppressLint("MissingPermission")
        void close() {
            clearTimeout();
            ready = false;
            if (gatt != null) {
                gatt.disconnect();
                gatt.close();
                gatt = null;
            }
        }

        void clearTimeout() {
            if (timeoutRunnable != null) {
                mainHandler.removeCallbacks(timeoutRunnable);
                timeoutRunnable = null;
            }
        }

        private final BluetoothGattCallback callback = new BluetoothGattCallback() {
            private void handleCharacteristicChanged(byte[] value) {
                if (value != null && value.length > 0) {
                    Log.i(
                        TAG,
                        "Notification received address=" + device.getAddress()
                            + " length=" + value.length
                            + " bytes=" + summarizeBytes(value)
                    );
                    emitNotification(device.getAddress(), value);
                }
            }

            @Override
            public void onConnectionStateChange(BluetoothGatt gatt, int status, int newState) {
                Log.i(TAG, "GATT state change address=" + device.getAddress() + " status=" + status + " newState=" + newState);
                if (newState == BluetoothGatt.STATE_CONNECTED) {
                    boolean mtuRequested = gatt.requestMtu(DESIRED_MTU);
                    Log.i(TAG, "Requested MTU address=" + device.getAddress() + " mtu=" + DESIRED_MTU + " started=" + mtuRequested);
                    if (!mtuRequested) {
                        gatt.discoverServices();
                    }
                    return;
                }

                clearTimeout();
                ready = false;
                sessions.remove(device.getAddress());
                emitDisconnect(device.getAddress());

                if (connectCall.isReleased()) {
                    return;
                }

                if (newState == BluetoothGatt.STATE_DISCONNECTED && !connectResultDelivered) {
                    connectResultDelivered = true;
                    connectCall.reject("Bluetooth connection failed.");
                }
            }

            @Override
            public void onMtuChanged(BluetoothGatt gatt, int mtu, int status) {
                Log.i(TAG, "MTU changed address=" + device.getAddress() + " mtu=" + mtu + " status=" + status);
                gatt.discoverServices();
            }

            @Override
            public void onServicesDiscovered(BluetoothGatt gatt, int status) {
                Log.i(TAG, "Services discovered address=" + device.getAddress() + " status=" + status);
                if (status != BluetoothGatt.GATT_SUCCESS) {
                    clearTimeout();
                    connectResultDelivered = true;
                    connectCall.reject("Bluetooth service discovery failed.");
                    return;
                }

                BluetoothGattService service = gatt.getService(LEGACY_SERVICE_UUID);
                UUID notifyUuid = LEGACY_NOTIFY_UUID;
                UUID writeUuid = LEGACY_WRITE_UUID;
                if (service == null) {
                    service = gatt.getService(MODERN_SERVICE_UUID);
                    notifyUuid = MODERN_NOTIFY_UUID;
                    writeUuid = MODERN_WRITE_UUID;
                }

                if (service == null) {
                    clearTimeout();
                    connectResultDelivered = true;
                    connectCall.reject("Pixels BLE service not found on device.");
                    return;
                }

                Log.i(
                    TAG,
                    "Using GATT service address=" + device.getAddress()
                        + " service=" + service.getUuid()
                        + " notify=" + notifyUuid
                        + " write=" + writeUuid
                );

                notifyCharacteristic = service.getCharacteristic(notifyUuid);
                writeCharacteristic = service.getCharacteristic(writeUuid);
                if (notifyCharacteristic == null || writeCharacteristic == null) {
                    clearTimeout();
                    connectResultDelivered = true;
                    connectCall.reject("Pixels BLE characteristics are unavailable.");
                    return;
                }

                gatt.setCharacteristicNotification(notifyCharacteristic, true);
                BluetoothGattDescriptor descriptor = notifyCharacteristic.getDescriptor(CLIENT_CHARACTERISTIC_CONFIG_UUID);
                if (descriptor != null) {
                    Log.i(TAG, "Enabling notifications address=" + device.getAddress() + " descriptor=" + descriptor.getUuid());
                    descriptor.setValue(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
                    gatt.writeDescriptor(descriptor);
                } else {
                    Log.i(TAG, "No CCC descriptor found; treating connection as ready address=" + device.getAddress());
                    clearTimeout();
                    ready = true;
                    connectResultDelivered = true;
                    connectCall.resolve(toDeviceResult(device));
                }
            }

            @Override
            public void onDescriptorWrite(BluetoothGatt gatt, BluetoothGattDescriptor descriptor, int status) {
                if (CLIENT_CHARACTERISTIC_CONFIG_UUID.equals(descriptor.getUuid())) {
                    Log.i(TAG, "Descriptor write address=" + device.getAddress() + " status=" + status + " descriptor=" + descriptor.getUuid());
                    if (status != BluetoothGatt.GATT_SUCCESS) {
                        clearTimeout();
                        connectResultDelivered = true;
                        connectCall.reject("Bluetooth notification setup failed.");
                        return;
                    }

                    clearTimeout();
                    ready = true;
                    connectResultDelivered = true;
                    connectCall.resolve(toDeviceResult(device));
                }
            }

            @Override
            public void onCharacteristicChanged(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic) {
                handleCharacteristicChanged(characteristic.getValue());
            }

            @Override
            public void onCharacteristicChanged(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic, byte[] value) {
                handleCharacteristicChanged(value);
            }
        };
    }
}