import 'package:flutter/services.dart';

import '../core/models.dart';

class OpenBubblePlatformBridge {
  static const MethodChannel _methodChannel = MethodChannel(
    'dev.openbubble.mobile/platform',
  );
  static const EventChannel _eventChannel = EventChannel(
    'dev.openbubble.mobile/events',
  );

  Stream<ServiceEvent> get events {
    return _eventChannel.receiveBroadcastStream().map((dynamic event) {
      return ServiceEvent.fromMap(_stringMap(event));
    });
  }

  Future<ServiceStatus> getServiceStatus() async {
    final result = await _methodChannel.invokeMethod<dynamic>(
      'getServiceStatus',
    );
    return ServiceStatus.fromMap(_stringMap(result));
  }

  Future<String> getServerBaseUrl() async {
    return await _methodChannel.invokeMethod<String>('getServerBaseUrl') ?? '';
  }

  Future<void> setServerBaseUrl(String value) async {
    await _methodChannel.invokeMethod<void>('setServerBaseUrl', <String, dynamic>{
      'value': value,
    });
  }

  Future<List<ServiceEvent>> getRecentEvents() async {
    final result = await _methodChannel.invokeMethod<dynamic>(
      'getRecentEvents',
    );
    final events = result as List<dynamic>? ?? const [];
    return events
        .map((dynamic item) => ServiceEvent.fromMap(_stringMap(item)))
        .toList();
  }

  Future<void> openAccessibilitySettings() async {
    await _methodChannel.invokeMethod<void>('openAccessibilitySettings');
  }

  Future<void> openNotificationSettings() async {
    await _methodChannel.invokeMethod<void>('openNotificationSettings');
  }

  Future<bool> showBubble() async {
    return await _methodChannel.invokeMethod<bool>('showBubble') ?? false;
  }

  Future<bool> hideBubble() async {
    return await _methodChannel.invokeMethod<bool>('hideBubble') ?? false;
  }

  Future<WindowSnapshot?> inspectActiveWindow() async {
    final result = await _methodChannel.invokeMethod<dynamic>(
      'inspectActiveWindow',
    );
    if (result == null) {
      return null;
    }

    final map = _stringMap(result);
    if (map.isEmpty || map['packageName'] == null) {
      return null;
    }

    return WindowSnapshot.fromMap(map);
  }

  Future<Map<String, dynamic>> captureActiveWindow({
    required String requestId,
  }) async {
    final result = await _methodChannel.invokeMethod<dynamic>(
      'captureActiveWindow',
      <String, dynamic>{'requestId': requestId},
    );
    return _stringMap(result);
  }

  Future<Map<String, dynamic>> fillFocusedField(String text) async {
    final result = await _methodChannel.invokeMethod<dynamic>(
      'fillFocusedField',
      <String, dynamic>{'text': text},
    );
    return _stringMap(result);
  }

  Future<void> cacheFillSuggestion(String text) async {
    await _methodChannel.invokeMethod<void>(
      'cacheFillSuggestion',
      <String, dynamic>{'text': text},
    );
  }

  Future<void> copyText(String text) async {
    await _methodChannel.invokeMethod<void>('copyText', <String, dynamic>{
      'text': text,
    });
  }
}

Map<String, dynamic> _stringMap(dynamic value) {
  if (value is Map<String, dynamic>) {
    return value;
  }

  if (value is Map) {
    return value.map(
      (dynamic key, dynamic entryValue) => MapEntry(key.toString(), entryValue),
    );
  }

  return <String, dynamic>{};
}
