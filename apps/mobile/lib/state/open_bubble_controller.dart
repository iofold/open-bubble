import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';

import '../core/mock/mock_app_server.dart';
import '../core/models.dart';
import '../platform/open_bubble_platform_bridge.dart';

class OpenBubbleController extends ChangeNotifier {
  OpenBubbleController({
    OpenBubblePlatformBridge? bridge,
    MockAppServer? mockAppServer,
  }) : _bridge = bridge ?? OpenBubblePlatformBridge(),
       _mockAppServer = mockAppServer ?? MockAppServer();

  final OpenBubblePlatformBridge _bridge;
  final MockAppServer _mockAppServer;

  StreamSubscription<ServiceEvent>? _eventSubscription;
  final Set<String> _submittedRequestIds = <String>{};

  bool _initialized = false;
  bool initializing = false;
  bool checkingHealth = false;
  bool performingAction = false;
  bool serverHealthy = false;

  String serverBaseUrl = 'http://10.0.2.2:8787';
  ServiceStatus serviceStatus = const ServiceStatus.initial();
  List<SessionSummary> sessions = const [];
  String? selectedSessionId;
  WindowSnapshot? latestInspection;
  CaptureSnapshot? latestCapture;
  ReplyDraft? latestReplyDraft;
  List<TimelineEntry> timeline = const [];

  SessionSummary? get selectedSession {
    if (selectedSessionId == null) {
      return null;
    }

    for (final session in sessions) {
      if (session.id == selectedSessionId) {
        return session;
      }
    }

    return null;
  }

  Future<void> initialize() async {
    if (_initialized || initializing) {
      return;
    }

    initializing = true;
    notifyListeners();

    _eventSubscription = _bridge.events.listen(_handlePlatformEvent);

    await Future.wait<void>([
      refreshSessions(),
      refreshServiceStatus(),
      checkServerHealth(),
      _hydrateRecentEvents(),
    ]);

    _addTimeline(
      title: 'Accessibility-first runtime ready',
      detail:
          'The Flutter shell, mocked server flow, and native Android bridge are wired together.',
      tone: TimelineTone.success,
    );

    initializing = false;
    _initialized = true;
    notifyListeners();
  }

  Future<void> refreshSessions() async {
    sessions = await _mockAppServer.fetchSessions();
    selectedSessionId ??= sessions.isNotEmpty ? sessions.first.id : null;
    notifyListeners();
  }

  void selectSession(String sessionId) {
    selectedSessionId = sessionId;
    notifyListeners();
  }

  Future<void> refreshServiceStatus() async {
    serviceStatus = await _bridge.getServiceStatus();
    notifyListeners();
  }

  Future<void> checkServerHealth() async {
    checkingHealth = true;
    notifyListeners();

    final uri = Uri.tryParse(serverBaseUrl);
    if (uri == null || !uri.hasScheme || uri.host.isEmpty) {
      serverHealthy = false;
      checkingHealth = false;
      notifyListeners();
      return;
    }

    final client = HttpClient();

    try {
      final request = await client
          .getUrl(uri.resolve('/health'))
          .timeout(const Duration(seconds: 2));
      final response = await request.close().timeout(
        const Duration(seconds: 2),
      );
      serverHealthy = response.statusCode >= 200 && response.statusCode < 300;
    } catch (_) {
      serverHealthy = false;
    } finally {
      client.close(force: true);
      checkingHealth = false;
      notifyListeners();
    }
  }

  Future<void> updateServerBaseUrl(String value) async {
    serverBaseUrl = value.trim();
    notifyListeners();
    await checkServerHealth();
  }

  Future<void> openAccessibilitySettings() async {
    await _bridge.openAccessibilitySettings();
    _addTimeline(
      title: 'Opened accessibility settings',
      detail: 'Enable the Open Bubble service, then return to refresh status.',
      tone: TimelineTone.info,
    );
    notifyListeners();
  }

  Future<void> showBubble() async {
    performingAction = true;
    notifyListeners();

    final shown = await _bridge.showBubble();
    await refreshServiceStatus();

    _addTimeline(
      title: shown ? 'Bubble shown' : 'Bubble unavailable',
      detail: shown
          ? 'The accessibility overlay should now stay alive while the app is backgrounded.'
          : 'The service must be connected before the bubble can appear.',
      tone: shown ? TimelineTone.success : TimelineTone.warning,
    );

    performingAction = false;
    notifyListeners();
  }

  Future<void> hideBubble() async {
    performingAction = true;
    notifyListeners();

    final hidden = await _bridge.hideBubble();
    await refreshServiceStatus();

    _addTimeline(
      title: hidden ? 'Bubble hidden' : 'Hide request skipped',
      detail: hidden
          ? 'The accessibility overlay has been removed from the screen.'
          : 'No overlay was available to hide.',
      tone: hidden ? TimelineTone.info : TimelineTone.warning,
    );

    performingAction = false;
    notifyListeners();
  }

  Future<void> inspectActiveWindow() async {
    performingAction = true;
    notifyListeners();

    final snapshot = await _bridge.inspectActiveWindow();
    if (snapshot == null) {
      _addTimeline(
        title: 'Inspection unavailable',
        detail:
            'The service is not connected or the active window could not be resolved.',
        tone: TimelineTone.warning,
      );
    } else {
      latestInspection = snapshot;
      _addTimeline(
        title: 'Active window inspected',
        detail:
            'Read package ${snapshot.packageName} with ${snapshot.visibleText.length} visible text fragments.',
        tone: TimelineTone.success,
      );
    }

    performingAction = false;
    notifyListeners();
  }

  Future<void> captureAndSend() async {
    final session = selectedSession;
    if (session == null) {
      return;
    }

    final requestId = _newRequestId();
    performingAction = true;
    notifyListeners();

    final response = await _bridge.captureActiveWindow(requestId: requestId);
    final accepted = response['accepted'] as bool? ?? false;

    if (accepted) {
      _addTimeline(
        title: 'Capture requested',
        detail:
            'The Android accessibility service accepted request $requestId and is preparing screenshot context.',
        tone: TimelineTone.info,
      );
    } else {
      latestCapture = CaptureSnapshot.mock(
        requestId: requestId,
        packageName: latestInspection?.packageName ?? 'mock.package',
      );

      _addTimeline(
        title: 'Using mocked capture',
        detail:
            'The native capture path is unavailable, so the mock server flow is continuing with synthesized context.',
        tone: TimelineTone.warning,
      );

      await _submitLatestContext(requestId: requestId, sessionId: session.id);
    }

    performingAction = false;
    notifyListeners();
  }

  Future<void> generateMockReply() async {
    final session = selectedSession;
    if (session == null) {
      return;
    }

    final requestId = _newRequestId();
    latestCapture = CaptureSnapshot.mock(
      requestId: requestId,
      packageName: latestInspection?.packageName ?? 'mock.package',
    );

    await _submitLatestContext(requestId: requestId, sessionId: session.id);
  }

  Future<void> fillLatestSuggestion() async {
    final draft = latestReplyDraft;
    if (draft == null) {
      return;
    }

    performingAction = true;
    notifyListeners();

    final result = await _bridge.fillFocusedField(draft.fillSuggestion);
    final success = result['success'] as bool? ?? false;
    final strategy = result['strategy'] as String? ?? 'none';

    _addTimeline(
      title: success ? 'Fill attempted' : 'Fill unavailable',
      detail: success
          ? 'The native runtime used the "$strategy" path to write into the focused field.'
          : 'No focused editable field was available, so the preview remained local.',
      tone: success ? TimelineTone.success : TimelineTone.warning,
    );

    performingAction = false;
    notifyListeners();
  }

  Future<void> copyLatestSuggestion() async {
    final draft = latestReplyDraft;
    if (draft == null) {
      return;
    }

    await _bridge.copyText(draft.fillSuggestion);
    _addTimeline(
      title: 'Copied suggestion',
      detail: 'The latest reviewed suggestion is now in the clipboard.',
      tone: TimelineTone.info,
    );
    notifyListeners();
  }

  Future<void> _hydrateRecentEvents() async {
    final recentEvents = await _bridge.getRecentEvents();
    for (final event in recentEvents) {
      _handlePlatformEvent(event, replayOnly: true);
    }
  }

  Future<void> _submitLatestContext({
    required String requestId,
    required String sessionId,
  }) async {
    if (_submittedRequestIds.contains(requestId)) {
      return;
    }

    _submittedRequestIds.add(requestId);
    performingAction = true;
    notifyListeners();

    final draft = await _mockAppServer.submitCapture(
      sessionId: sessionId,
      requestId: requestId,
      inspection: latestInspection,
      capture: latestCapture,
    );

    latestReplyDraft = draft;
    _addTimeline(
      title: 'Mocked reply ready',
      detail:
          'The mock pipeline correlated request $requestId and prepared a review-before-fill draft.',
      tone: TimelineTone.success,
    );

    performingAction = false;
    notifyListeners();
  }

  void _handlePlatformEvent(ServiceEvent event, {bool replayOnly = false}) {
    switch (event.type) {
      case 'service.connected':
        serviceStatus = serviceStatus.copyWith(
          accessibilityEnabled: true,
          serviceConnected: true,
          lastUpdated: event.timestamp,
        );
        break;
      case 'service.disconnected':
        serviceStatus = serviceStatus.copyWith(
          serviceConnected: false,
          bubbleVisible: false,
          lastUpdated: event.timestamp,
        );
        break;
      case 'bubble.shown':
        serviceStatus = serviceStatus.copyWith(
          bubbleVisible: true,
          lastUpdated: event.timestamp,
        );
        break;
      case 'bubble.hidden':
        serviceStatus = serviceStatus.copyWith(
          bubbleVisible: false,
          lastUpdated: event.timestamp,
        );
        break;
      case 'inspection.ready':
        latestInspection = WindowSnapshot.fromMap(event.payload);
        break;
      case 'capture.ready':
        latestCapture = CaptureSnapshot.fromMap(event.payload);
        final sessionId = selectedSessionId ?? _firstSessionId;
        if (sessionId != null) {
          unawaited(
            _submitLatestContext(
              requestId: latestCapture!.requestId,
              sessionId: sessionId,
            ),
          );
        }
        break;
      default:
        break;
    }

    if (!replayOnly) {
      _addTimeline(
        title: event.type,
        detail: event.message ?? 'Native platform event received.',
        tone: switch (event.type) {
          'capture.failed' || 'fill.failed' => TimelineTone.error,
          'bubble.longPress' => TimelineTone.info,
          _ => TimelineTone.info,
        },
      );
    }

    notifyListeners();
  }

  String? get _firstSessionId => sessions.isEmpty ? null : sessions.first.id;

  void _addTimeline({
    required String title,
    required String detail,
    required TimelineTone tone,
  }) {
    final entry = TimelineEntry(
      id: '${DateTime.now().microsecondsSinceEpoch}',
      title: title,
      detail: detail,
      timestamp: DateTime.now().toIso8601String(),
      tone: tone,
    );

    timeline = <TimelineEntry>[entry, ...timeline].take(18).toList();
  }

  String _newRequestId() {
    return 'req_${DateTime.now().millisecondsSinceEpoch}';
  }

  @override
  void dispose() {
    _eventSubscription?.cancel();
    super.dispose();
  }
}
