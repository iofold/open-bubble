import 'dart:async';
import 'dart:collection';
import 'dart:developer' as developer;
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
  final Set<String> _processedEventKeys = <String>{};
  final Queue<String> _processedEventOrder = ListQueue<String>();

  bool _initialized = false;
  bool initializing = false;
  bool checkingHealth = false;
  bool performingAction = false;
  bool serverHealthy = false;

  String serverBaseUrl = 'http://10.0.2.2:3000';
  ServiceStatus serviceStatus = const ServiceStatus.initial();
  List<SessionSummary> sessions = const [];
  List<RequestJob> requests = const [];
  String? selectedSessionId;
  String? activeRequestId;
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

  RequestJob? get activeRequest {
    if (activeRequestId == null) {
      return null;
    }

    for (final request in requests) {
      if (request.requestId == activeRequestId) {
        return request;
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
    final persistedServerBaseUrl = await _bridge.getServerBaseUrl();
    if (persistedServerBaseUrl.trim().isNotEmpty) {
      serverBaseUrl = persistedServerBaseUrl.trim();
    }

    await Future.wait<void>([
      refreshSessions(),
      refreshServiceStatus(),
      _hydrateRecentEvents(),
    ]);
    await checkServerHealth();

    _addTimeline(
      title: 'Accessibility + prompt runtime ready',
      detail:
          'The Flutter shell is now tracking the native bubble, real App Server health, and prompt task events coming back from Android.',
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
    _log(
      'service_status',
      'enabled=${serviceStatus.accessibilityEnabled} connected=${serviceStatus.serviceConnected} bubble=${serviceStatus.bubbleVisible} shortcut=${serviceStatus.systemShortcutAssigned}',
    );
    notifyListeners();
  }

  Future<void> handleAppResumed() async {
    if (!_initialized) {
      return;
    }

    await Future.wait<void>([
      refreshServiceStatus(),
      checkServerHealth(),
      _hydrateRecentEvents(),
    ]);
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
    await _bridge.setServerBaseUrl(serverBaseUrl);
    notifyListeners();
    await checkServerHealth();
  }

  Future<void> openAccessibilitySettings() async {
    _log(
      'open_accessibility_settings',
      'Opening Android accessibility settings.',
    );
    await _bridge.openAccessibilitySettings();
    _addTimeline(
      title: 'Opened accessibility settings',
      detail: 'Enable the Open Bubble service, then return to refresh status.',
      tone: TimelineTone.info,
    );
    notifyListeners();
  }

  Future<void> openNotificationSettings() async {
    _log(
      'open_notification_settings',
      'Opening Android notification settings.',
    );
    await _bridge.openNotificationSettings();
    _addTimeline(
      title: 'Opened notification settings',
      detail:
          'Enable notifications if you want background bubble replies to raise a system alert in addition to copying the clipboard.',
      tone: TimelineTone.info,
    );
    notifyListeners();
  }

  Future<void> showBubble() async {
    performingAction = true;
    notifyListeners();

    final shown = await _bridge.showBubble();
    _log('show_bubble', 'shown=$shown');
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
    _log('hide_bubble', 'hidden=$hidden');
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
    _log(
      'inspect_active_window',
      snapshot == null
          ? 'no snapshot'
          : 'package=${snapshot.packageName} text=${snapshot.visibleText.length}',
    );
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
    _log('capture_active_window', 'requestId=$requestId accepted=$accepted');

    _startRequest(
      requestId: requestId,
      sessionId: session.id,
      sessionTitle: session.title,
      stage: accepted ? RequestStage.capturing : RequestStage.uploading,
      detail: accepted
          ? 'Waiting for the Android accessibility service to finish the capture.'
          : 'Native capture is unavailable, so the client is switching to mocked context.',
      usesMockCapture: !accepted,
    );

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
    _log('generate_mock_reply', 'requestId=$requestId session=${session.id}');
    latestCapture = CaptureSnapshot.mock(
      requestId: requestId,
      packageName: latestInspection?.packageName ?? 'mock.package',
    );
    _startRequest(
      requestId: requestId,
      sessionId: session.id,
      sessionTitle: session.title,
      stage: RequestStage.drafting,
      detail: 'Synthesizing a mocked request from the latest window context.',
      usesMockCapture: true,
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
    _log('fill_latest_suggestion', 'success=$success strategy=$strategy');

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
    _log('copy_latest_suggestion', 'Copied latest draft to clipboard.');
    _addTimeline(
      title: 'Copied suggestion',
      detail: 'The latest reviewed suggestion is now in the clipboard.',
      tone: TimelineTone.info,
    );
    notifyListeners();
  }

  Future<void> _hydrateRecentEvents() async {
    final recentEvents = await _bridge.getRecentEvents();
    for (final event in recentEvents.reversed) {
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
    _updateRequest(
      requestId,
      stage: RequestStage.drafting,
      detail: 'Submitting the latest context to the mocked App Server.',
    );
    notifyListeners();

    final draft = await _mockAppServer.submitCapture(
      sessionId: sessionId,
      requestId: requestId,
      inspection: latestInspection,
      capture: latestCapture,
    );

    latestReplyDraft = draft;
    await _bridge.cacheFillSuggestion(draft.fillSuggestion);
    _updateRequest(
      requestId,
      stage: RequestStage.ready,
      detail: 'Draft ready for review-before-fill.',
    );
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
    if (!_markEventProcessed(event)) {
      return;
    }

    _log('platform_event', '${event.type} ${event.message ?? ''}');
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
      case 'overlay.workflow.started':
        final requestId = event.payload['requestId'] as String?;
        final mode = event.payload['mode'] as String?;
        final session = _sessionForMode(mode);
        if (requestId != null && session != null) {
          selectedSessionId = session.id;
          _ensureRequest(
            requestId: requestId,
            session: session,
            stage: mode == 'pull'
                ? RequestStage.drafting
                : RequestStage.capturing,
            detail: switch (mode) {
              'prompt' =>
                'Capturing the current external app and preparing a real prompt request for the App Server.',
              'pull' =>
                'Reading the current screen and preparing a structured mock data pull.',
              _ =>
                'Capturing the current external app and preparing a mocked reply.',
            },
            usesMockCapture: mode != 'prompt',
          );
        }
        break;
      case 'capture.ready':
        latestCapture = CaptureSnapshot.fromMap(event.payload);
        final mode = event.payload['mode'] as String?;
        final snapshotPayload = event.payload['windowSnapshot'];
        if (snapshotPayload is Map) {
          latestInspection = WindowSnapshot.fromMap(
            snapshotPayload.map(
              (key, value) => MapEntry(key.toString(), value),
            ),
          );
        }
        _updateRequest(
          latestCapture!.requestId,
          stage: mode == 'prompt'
              ? RequestStage.uploading
              : RequestStage.drafting,
          detail: mode == 'prompt'
              ? 'Screenshot persisted. Uploading prompt and image to the App Server.'
              : 'Screenshot persisted. Drafting a mocked server response now.',
        );
        if (!_isOverlayManagedRequest(latestCapture!.requestId)) {
          final sessionId = selectedSessionId ?? _firstSessionId;
          if (sessionId != null) {
            unawaited(
              _submitLatestContext(
                requestId: latestCapture!.requestId,
                sessionId: sessionId,
              ),
            );
          }
        }
        break;
      case 'task.accepted':
        final requestId = event.payload['requestId'] as String?;
        if (requestId != null) {
          _updateRequest(
            requestId,
            stage: RequestStage.drafting,
            detail:
                'The App Server accepted the task. Open Bubble is polling for the result now.',
            usesMockCapture: false,
          );
        }
        break;
      case 'task.completed':
        final requestId = event.payload['requestId'] as String?;
        if (requestId != null) {
          _updateRequest(
            requestId,
            stage: RequestStage.ready,
            detail:
                'The App Server completed the task. The answer was copied to the clipboard and synced into review.',
            usesMockCapture: false,
          );
        }
        break;
      case 'task.failed':
        final requestId = event.payload['requestId'] as String?;
        if (requestId != null) {
          _updateRequest(
            requestId,
            stage: RequestStage.failed,
            detail:
                event.message ??
                'The App Server request failed before a reply was ready.',
            usesMockCapture: false,
          );
        }
        break;
      case 'overlay.reply.ready':
        final requestId = event.payload['requestId'] as String?;
        final mode = event.payload['mode'] as String?;
        final session = _sessionForMode(mode);
        if (requestId != null && session != null) {
          selectedSessionId = session.id;
          latestReplyDraft = ReplyDraft(
            requestId: requestId,
            sessionId: session.id,
            title: event.payload['title'] as String? ?? 'Overlay reply ready',
            replyText:
                event.payload['replyText'] as String? ??
                'The native overlay prepared a background reply.',
            fillSuggestion: event.payload['fillSuggestion'] as String? ?? '',
            confidence: event.payload['confidence'] as String? ?? 'high',
            warnings: (event.payload['warnings'] as List<dynamic>? ?? const [])
                .map((item) => item.toString())
                .toList(),
            updatedAt:
                event.payload['updatedAt'] as String? ??
                DateTime.now().toIso8601String(),
          );
          _ensureRequest(
            requestId: requestId,
            session: session,
            stage: RequestStage.ready,
            detail: switch (mode) {
              'prompt' =>
                'The App Server reply is ready in the clipboard and available for review-before-fill.',
              'pull' =>
                'Mock data is ready in the clipboard and available for review-before-fill.',
              _ =>
                'Background capture reply is ready in the clipboard and available for review-before-fill.',
            },
            usesMockCapture: mode != 'prompt',
          );
        }
        break;
      case 'overlay.workflow.failed':
        final requestId = event.payload['requestId'] as String?;
        if (requestId != null) {
          unawaited(refreshServiceStatus());
          _updateRequest(
            requestId,
            stage: RequestStage.failed,
            detail: event.message ??
                'The background overlay workflow failed. Retry from the bubble or reopen the app for more detail.',
          );
        }
        break;
      case 'capture.failed':
        final requestId = event.payload['requestId'] as String?;
        if (requestId != null) {
          _updateRequest(
            requestId,
            stage: RequestStage.failed,
            detail:
                'Native capture failed. The next step is either retrying or switching to a mocked capture.',
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
          'capture.failed' ||
          'fill.failed' ||
          'overlay.workflow.failed' ||
          'task.failed' => TimelineTone.error,
          'fill.completed' ||
          'overlay.reply.ready' ||
          'task.completed' => TimelineTone.success,
          'bubble.longPress' => TimelineTone.info,
          _ => TimelineTone.info,
        },
      );
    }

    notifyListeners();
  }

  String? get _firstSessionId => sessions.isEmpty ? null : sessions.first.id;

  SessionSummary? _sessionForMode(String? mode) {
    if (sessions.isEmpty) {
      return null;
    }

    if (mode == 'prompt') {
      return selectedSession ??
          _findSessionById('sess_hackathon_001') ??
          sessions.first;
    }

    if (mode == 'pull') {
      return _findSessionById('sess_hackathon_002') ??
          selectedSession ??
          sessions.first;
    }

    if (mode == 'capture') {
      return selectedSession ??
          _findSessionById('sess_hackathon_001') ??
          sessions.first;
    }

    return selectedSession ?? sessions.first;
  }

  SessionSummary? _findSessionById(String sessionId) {
    for (final session in sessions) {
      if (session.id == sessionId) {
        return session;
      }
    }

    return null;
  }

  void _ensureRequest({
    required String requestId,
    required SessionSummary session,
    required RequestStage stage,
    required String detail,
    required bool usesMockCapture,
  }) {
    final existing = requests.where(
      (request) => request.requestId == requestId,
    );
    if (existing.isEmpty) {
      _startRequest(
        requestId: requestId,
        sessionId: session.id,
        sessionTitle: session.title,
        stage: stage,
        detail: detail,
        usesMockCapture: usesMockCapture,
      );
      return;
    }

    _updateRequest(
      requestId,
      stage: stage,
      detail: detail,
      usesMockCapture: usesMockCapture,
    );
  }

  bool _isOverlayManagedRequest(String requestId) {
    return requestId.startsWith('orb_') ||
        requestId.startsWith('pull_') ||
        requestId.startsWith('prompt_');
  }

  bool _markEventProcessed(ServiceEvent event) {
    final requestId = event.payload['requestId'] as String? ?? '';
    final fingerprint = '${event.type}|${event.timestamp}|$requestId';
    if (_processedEventKeys.contains(fingerprint)) {
      return false;
    }

    _processedEventKeys.add(fingerprint);
    _processedEventOrder.addLast(fingerprint);
    while (_processedEventOrder.length > 96) {
      final stale = _processedEventOrder.removeFirst();
      _processedEventKeys.remove(stale);
    }
    return true;
  }

  void _startRequest({
    required String requestId,
    required String sessionId,
    required String sessionTitle,
    required RequestStage stage,
    required String detail,
    bool usesMockCapture = false,
  }) {
    final now = DateTime.now().toIso8601String();
    activeRequestId = requestId;
    requests = <RequestJob>[
      RequestJob(
        requestId: requestId,
        sessionId: sessionId,
        sessionTitle: sessionTitle,
        stage: stage,
        detail: detail,
        createdAt: now,
        updatedAt: now,
        usesMockCapture: usesMockCapture,
      ),
      ...requests.where((request) => request.requestId != requestId),
    ].take(8).toList();
  }

  void _updateRequest(
    String requestId, {
    RequestStage? stage,
    String? detail,
    bool? usesMockCapture,
  }) {
    final updatedAt = DateTime.now().toIso8601String();
    requests = requests.map((request) {
      if (request.requestId != requestId) {
        return request;
      }

      return request.copyWith(
        stage: stage,
        detail: detail,
        updatedAt: updatedAt,
        usesMockCapture: usesMockCapture,
      );
    }).toList();
    activeRequestId = requestId;
  }

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

  void _log(String name, String message) {
    developer.log(message, name: 'open_bubble.$name');
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
