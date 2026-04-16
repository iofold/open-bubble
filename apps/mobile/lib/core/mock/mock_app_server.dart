import 'dart:async';

import '../models.dart';

class MockAppServer {
  Future<List<SessionSummary>> fetchSessions() async {
    await Future<void>.delayed(const Duration(milliseconds: 220));

    return const [
      SessionSummary(
        id: 'sess_hackathon_001',
        title: 'Calculator Fix Flow',
        status: 'running',
        agentKind: 'codex',
        updatedAt: 'Updated moments ago',
        summary:
            'The active Codex session is fixing a calculator crash and waiting for fresh phone-side context.',
        currentTask: 'Reproduce the latest UI bug and prepare a patch summary.',
      ),
      SessionSummary(
        id: 'sess_hackathon_002',
        title: 'Personal Data Pull',
        status: 'waiting_for_input',
        agentKind: 'memory',
        updatedAt: 'Updated 4 min ago',
        summary:
            'The server is ready to retrieve user memory, documents, or structured personal details on request.',
        currentTask:
            'Await a capture or a reply request from the phone bubble.',
      ),
      SessionSummary(
        id: 'sess_hackathon_003',
        title: 'Bubble Demo Script',
        status: 'done',
        agentKind: 'demo',
        updatedAt: 'Updated 18 min ago',
        summary:
            'A canned demo session that is useful for presentations when the real backend is offline.',
        currentTask: 'No action required.',
      ),
    ];
  }

  Future<ReplyDraft> submitCapture({
    required String sessionId,
    required String requestId,
    WindowSnapshot? inspection,
    CaptureSnapshot? capture,
  }) async {
    await Future<void>.delayed(const Duration(milliseconds: 900));

    final sourcePackage = inspection?.packageName.isNotEmpty == true
        ? inspection!.packageName
        : capture?.packageName.isNotEmpty == true
        ? capture!.packageName
        : 'the current app';

    final visibleSignal =
        inspection?.visibleText
            .take(2)
            .where((value) => value.isNotEmpty)
            .join(' · ') ??
        '';

    final fieldHint = inspection?.focusedField?.label.isNotEmpty == true
        ? inspection!.focusedField!.label
        : inspection?.focusedField?.hint ?? 'current field';

    final fillSuggestion = switch (sessionId) {
      'sess_hackathon_001' =>
        'I reproduced the issue in $sourcePackage. The visible error is "$visibleSignal". I prepared a fix summary and next test steps.',
      'sess_hackathon_002' =>
        'Here are the policy details you asked for. I can also paste the formatted reply into $fieldHint if you want.',
      _ =>
        'Open Bubble captured the latest screen context from $sourcePackage. The next step is ready for review.',
    };

    final replyText = switch (sessionId) {
      'sess_hackathon_001' =>
        'The calculator flow is now mapped to the active screen. I would send the screenshot plus OCR text to Codex, ask it to inspect the crash path, then return a concise answer for the user to paste or forward.',
      'sess_hackathon_002' =>
        'The server-side memory/document flow can now return a user-reviewed answer instead of silently filling. That keeps the phone UX fast without giving up control.',
      _ =>
        'The mocked App Server accepted the capture, correlated it to the selected session, and produced a reviewable draft reply.',
    };

    return ReplyDraft(
      requestId: requestId,
      sessionId: sessionId,
      title: 'Mocked reply ready',
      replyText: replyText,
      fillSuggestion: fillSuggestion,
      confidence: 'high',
      warnings: const [
        'Review before filling into another app.',
        'Sensitive or secure screens should be handled as unsupported.',
      ],
      updatedAt: DateTime.now().toIso8601String(),
    );
  }
}
