enum TimelineTone { info, success, warning, error }

enum RequestStage { queued, capturing, uploading, drafting, ready, failed }

class ServiceStatus {
  const ServiceStatus({
    required this.accessibilityEnabled,
    required this.serviceConnected,
    required this.bubbleVisible,
    required this.systemShortcutAssigned,
    required this.notificationsEnabled,
    required this.captureSupported,
    required this.windowScopedCaptureSupported,
    required this.sdkInt,
    required this.platformLabel,
    required this.lastUpdated,
    this.note,
  });

  const ServiceStatus.initial()
    : accessibilityEnabled = false,
      serviceConnected = false,
      bubbleVisible = false,
      systemShortcutAssigned = false,
      notificationsEnabled = false,
      captureSupported = false,
      windowScopedCaptureSupported = false,
      sdkInt = 0,
      platformLabel = 'android',
      lastUpdated = '',
      note = null;

  final bool accessibilityEnabled;
  final bool serviceConnected;
  final bool bubbleVisible;
  final bool systemShortcutAssigned;
  final bool notificationsEnabled;
  final bool captureSupported;
  final bool windowScopedCaptureSupported;
  final int sdkInt;
  final String platformLabel;
  final String lastUpdated;
  final String? note;

  factory ServiceStatus.fromMap(Map<String, dynamic> map) {
    return ServiceStatus(
      accessibilityEnabled: map['accessibilityEnabled'] as bool? ?? false,
      serviceConnected: map['serviceConnected'] as bool? ?? false,
      bubbleVisible: map['bubbleVisible'] as bool? ?? false,
      systemShortcutAssigned: map['systemShortcutAssigned'] as bool? ?? false,
      notificationsEnabled: map['notificationsEnabled'] as bool? ?? false,
      captureSupported: map['captureSupported'] as bool? ?? false,
      windowScopedCaptureSupported:
          map['windowScopedCaptureSupported'] as bool? ?? false,
      sdkInt: map['sdkInt'] as int? ?? 0,
      platformLabel: map['platformLabel'] as String? ?? 'android',
      lastUpdated: map['lastUpdated'] as String? ?? '',
      note: map['note'] as String?,
    );
  }

  ServiceStatus copyWith({
    bool? accessibilityEnabled,
    bool? serviceConnected,
    bool? bubbleVisible,
    bool? systemShortcutAssigned,
    bool? notificationsEnabled,
    bool? captureSupported,
    bool? windowScopedCaptureSupported,
    int? sdkInt,
    String? platformLabel,
    String? lastUpdated,
    String? note,
  }) {
    return ServiceStatus(
      accessibilityEnabled: accessibilityEnabled ?? this.accessibilityEnabled,
      serviceConnected: serviceConnected ?? this.serviceConnected,
      bubbleVisible: bubbleVisible ?? this.bubbleVisible,
      systemShortcutAssigned:
          systemShortcutAssigned ?? this.systemShortcutAssigned,
      notificationsEnabled: notificationsEnabled ?? this.notificationsEnabled,
      captureSupported: captureSupported ?? this.captureSupported,
      windowScopedCaptureSupported:
          windowScopedCaptureSupported ?? this.windowScopedCaptureSupported,
      sdkInt: sdkInt ?? this.sdkInt,
      platformLabel: platformLabel ?? this.platformLabel,
      lastUpdated: lastUpdated ?? this.lastUpdated,
      note: note ?? this.note,
    );
  }
}

class ScreenBounds {
  const ScreenBounds({
    required this.left,
    required this.top,
    required this.right,
    required this.bottom,
    required this.width,
    required this.height,
  });

  final int left;
  final int top;
  final int right;
  final int bottom;
  final int width;
  final int height;

  factory ScreenBounds.fromMap(Map<String, dynamic> map) {
    return ScreenBounds(
      left: map['left'] as int? ?? 0,
      top: map['top'] as int? ?? 0,
      right: map['right'] as int? ?? 0,
      bottom: map['bottom'] as int? ?? 0,
      width: map['width'] as int? ?? 0,
      height: map['height'] as int? ?? 0,
    );
  }
}

class FocusedField {
  const FocusedField({
    required this.label,
    required this.hint,
    required this.supportsSetText,
    required this.supportsPaste,
    this.bounds,
  });

  final String label;
  final String hint;
  final bool supportsSetText;
  final bool supportsPaste;
  final ScreenBounds? bounds;

  factory FocusedField.fromMap(Map<String, dynamic> map) {
    return FocusedField(
      label: map['label'] as String? ?? '',
      hint: map['hint'] as String? ?? '',
      supportsSetText: map['supportsSetText'] as bool? ?? false,
      supportsPaste: map['supportsPaste'] as bool? ?? false,
      bounds: map['bounds'] is Map
          ? ScreenBounds.fromMap(_asStringMap(map['bounds']))
          : null,
    );
  }
}

class WindowSnapshot {
  const WindowSnapshot({
    required this.packageName,
    required this.className,
    required this.windowCount,
    required this.visibleText,
    required this.editableLabels,
    this.focusedField,
  });

  final String packageName;
  final String className;
  final int windowCount;
  final List<String> visibleText;
  final List<String> editableLabels;
  final FocusedField? focusedField;

  factory WindowSnapshot.fromMap(Map<String, dynamic> map) {
    return WindowSnapshot(
      packageName: map['packageName'] as String? ?? '',
      className: map['className'] as String? ?? '',
      windowCount: map['windowCount'] as int? ?? 0,
      visibleText: (map['visibleText'] as List<dynamic>? ?? const [])
          .map((item) => item.toString())
          .toList(),
      editableLabels: (map['editableLabels'] as List<dynamic>? ?? const [])
          .map((item) => item.toString())
          .toList(),
      focusedField: map['focusedField'] is Map
          ? FocusedField.fromMap(_asStringMap(map['focusedField']))
          : null,
    );
  }
}

class CaptureSnapshot {
  const CaptureSnapshot({
    required this.requestId,
    required this.capturedAt,
    required this.packageName,
    required this.width,
    required this.height,
    required this.filePath,
    required this.source,
  });

  final String requestId;
  final String capturedAt;
  final String packageName;
  final int width;
  final int height;
  final String filePath;
  final String source;

  factory CaptureSnapshot.fromMap(Map<String, dynamic> map) {
    return CaptureSnapshot(
      requestId: map['requestId'] as String? ?? '',
      capturedAt: map['capturedAt'] as String? ?? '',
      packageName: map['packageName'] as String? ?? '',
      width: map['width'] as int? ?? 0,
      height: map['height'] as int? ?? 0,
      filePath: map['filePath'] as String? ?? '',
      source: map['source'] as String? ?? 'unknown',
    );
  }

  factory CaptureSnapshot.mock({
    required String requestId,
    required String packageName,
  }) {
    return CaptureSnapshot(
      requestId: requestId,
      capturedAt: DateTime.now().toIso8601String(),
      packageName: packageName,
      width: 1080,
      height: 2400,
      filePath: 'mock://open-bubble/$requestId.png',
      source: 'mock',
    );
  }
}

class ServiceEvent {
  const ServiceEvent({
    required this.type,
    required this.timestamp,
    this.message,
    this.payload = const {},
  });

  final String type;
  final String timestamp;
  final String? message;
  final Map<String, dynamic> payload;

  factory ServiceEvent.fromMap(Map<String, dynamic> map) {
    return ServiceEvent(
      type: map['type'] as String? ?? 'unknown',
      timestamp:
          map['timestamp'] as String? ?? DateTime.now().toIso8601String(),
      message: map['message'] as String?,
      payload: map['payload'] is Map ? _asStringMap(map['payload']) : const {},
    );
  }
}

class SessionSummary {
  const SessionSummary({
    required this.id,
    required this.title,
    required this.status,
    required this.agentKind,
    required this.updatedAt,
    required this.summary,
    required this.currentTask,
  });

  final String id;
  final String title;
  final String status;
  final String agentKind;
  final String updatedAt;
  final String summary;
  final String currentTask;
}

class ReplyDraft {
  const ReplyDraft({
    required this.requestId,
    required this.sessionId,
    required this.title,
    required this.replyText,
    required this.fillSuggestion,
    required this.confidence,
    required this.warnings,
    required this.updatedAt,
  });

  final String requestId;
  final String sessionId;
  final String title;
  final String replyText;
  final String fillSuggestion;
  final String confidence;
  final List<String> warnings;
  final String updatedAt;
}

class RequestJob {
  const RequestJob({
    required this.requestId,
    required this.sessionId,
    required this.sessionTitle,
    required this.stage,
    required this.detail,
    required this.createdAt,
    required this.updatedAt,
    this.usesMockCapture = false,
  });

  final String requestId;
  final String sessionId;
  final String sessionTitle;
  final RequestStage stage;
  final String detail;
  final String createdAt;
  final String updatedAt;
  final bool usesMockCapture;

  String get stageLabel {
    return switch (stage) {
      RequestStage.queued => 'queued',
      RequestStage.capturing => 'capturing',
      RequestStage.uploading => 'uploading',
      RequestStage.drafting => 'drafting',
      RequestStage.ready => 'ready',
      RequestStage.failed => 'failed',
    };
  }

  RequestJob copyWith({
    RequestStage? stage,
    String? detail,
    String? updatedAt,
    bool? usesMockCapture,
  }) {
    return RequestJob(
      requestId: requestId,
      sessionId: sessionId,
      sessionTitle: sessionTitle,
      stage: stage ?? this.stage,
      detail: detail ?? this.detail,
      createdAt: createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      usesMockCapture: usesMockCapture ?? this.usesMockCapture,
    );
  }
}

class TimelineEntry {
  const TimelineEntry({
    required this.id,
    required this.title,
    required this.detail,
    required this.timestamp,
    required this.tone,
  });

  final String id;
  final String title;
  final String detail;
  final String timestamp;
  final TimelineTone tone;
}

Map<String, dynamic> _asStringMap(Object? value) {
  if (value is Map<String, dynamic>) {
    return value;
  }

  if (value is Map) {
    return value.map((key, mapValue) => MapEntry(key.toString(), mapValue));
  }

  return const {};
}
