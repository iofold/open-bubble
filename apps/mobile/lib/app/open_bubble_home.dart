import 'dart:io';

import 'package:flutter/material.dart';

import '../core/models.dart';
import '../state/open_bubble_controller.dart';

class OpenBubbleHome extends StatefulWidget {
  const OpenBubbleHome({super.key, required this.controller});

  final OpenBubbleController controller;

  @override
  State<OpenBubbleHome> createState() => _OpenBubbleHomeState();
}

class _OpenBubbleHomeState extends State<OpenBubbleHome> {
  late final TextEditingController _serverController;
  late final TextEditingController _sandboxController;
  int _tabIndex = 0;

  @override
  void initState() {
    super.initState();
    _serverController = TextEditingController(
      text: widget.controller.serverBaseUrl,
    );
    _sandboxController = TextEditingController();
  }

  @override
  void dispose() {
    _serverController.dispose();
    _sandboxController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return AnimatedBuilder(
      animation: widget.controller,
      builder: (context, child) {
        final controller = widget.controller;
        if (_serverController.text != controller.serverBaseUrl) {
          _serverController.value = _serverController.value.copyWith(
            text: controller.serverBaseUrl,
            selection: TextSelection.collapsed(
              offset: controller.serverBaseUrl.length,
            ),
          );
        }
        final pages = <Widget>[
          _HomePage(
            controller: controller,
            onOpenSettings: () {
              setState(() {
                _tabIndex = 2;
              });
            },
          ),
          _TasksPage(
            controller: controller,
            sandboxController: _sandboxController,
          ),
          _SettingsPage(
            controller: controller,
            serverController: _serverController,
          ),
        ];

        return Scaffold(
          body: DecoratedBox(
            decoration: const BoxDecoration(color: Color(0xFFF2F1EC)),
            child: Stack(
              children: [
                const _BackdropOrbs(),
                SafeArea(
                  child: Column(
                    children: [
                      Padding(
                        padding: const EdgeInsets.fromLTRB(20, 18, 20, 12),
                        child: _HeroDeck(controller: controller),
                      ),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 20),
                        child: SegmentedButton<int>(
                          segments: const [
                            ButtonSegment<int>(
                              value: 0,
                              icon: Icon(Icons.home_rounded),
                              label: Text('Home'),
                            ),
                            ButtonSegment<int>(
                              value: 1,
                              icon: Icon(Icons.schedule_rounded),
                              label: Text('Tasks'),
                            ),
                            ButtonSegment<int>(
                              value: 2,
                              icon: Icon(Icons.tune_rounded),
                              label: Text('Settings'),
                            ),
                          ],
                          selected: <int>{_tabIndex},
                          onSelectionChanged: (selection) {
                            setState(() {
                              _tabIndex = selection.first;
                            });
                          },
                          style: SegmentedButton.styleFrom(
                            selectedBackgroundColor: theme.colorScheme.primary,
                            selectedForegroundColor: Colors.white,
                            foregroundColor: const Color(0xFF202020),
                            backgroundColor: Colors.white,
                            side: const BorderSide(color: Color(0x22000000)),
                          ),
                        ),
                      ),
                      const SizedBox(height: 12),
                      Expanded(
                        child: AnimatedSwitcher(
                          duration: const Duration(milliseconds: 250),
                          child: KeyedSubtree(
                            key: ValueKey<int>(_tabIndex),
                            child: pages[_tabIndex],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _HomePage extends StatelessWidget {
  const _HomePage({required this.controller, required this.onOpenSettings});

  final OpenBubbleController controller;
  final VoidCallback onOpenSettings;

  @override
  Widget build(BuildContext context) {
    final recentRequests = controller.requests.take(3).toList();
    final theme = Theme.of(context);
    final service = controller.serviceStatus;
    final online = controller.serverHealthy && service.serviceConnected;

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
      children: [
        _GlassCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'READY // developer mode',
                          style: theme.textTheme.labelLarge?.copyWith(
                            letterSpacing: 0.8,
                            color: const Color(0xFF777777),
                          ),
                        ),
                        const SizedBox(height: 10),
                        Text(
                          'Your orb is standing by.',
                          style: theme.textTheme.headlineSmall,
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Keep the app clean, keep the orb visible, and let the prompt + screenshot flow do the heavy lifting.',
                          style: theme.textTheme.bodyLarge?.copyWith(
                            color: const Color(0xFF4C4C4C),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 16),
                  const _LogoCoin(),
                ],
              ),
              const SizedBox(height: 22),
              Wrap(
                spacing: 10,
                runSpacing: 10,
                children: [
                  _PresencePill(
                    label: online
                        ? 'Codex server online'
                        : 'Codex server offline',
                    online: online,
                  ),
                  _QuietPill(
                    label: service.bubbleVisible
                        ? 'Bubble visible'
                        : 'Bubble hidden',
                  ),
                  _QuietPill(
                    label: controller.latestReplyDraft == null
                        ? 'No fresh reply'
                        : 'Reply ready',
                  ),
                ],
              ),
              const SizedBox(height: 18),
              Text(
                online
                    ? 'Open Bubble is ready. Long-press the orb on any screen, send a prompt, and the reply will come back through notifications and clipboard.'
                    : 'Finish runtime setup once, then this app can mostly stay out of the way while the orb handles the work.',
                style: theme.textTheme.bodyLarge?.copyWith(
                  color: const Color(0xFF4C4C4C),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        Row(
          children: [
            Expanded(
              child: _QuickActionCard(
                title: 'Show bubble',
                subtitle: 'Put the orb on screen.',
                icon: Icons.radio_button_checked_rounded,
                onTap: controller.showBubble,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _QuickActionCard(
                title: 'Refresh',
                subtitle: 'Sync service + server.',
                icon: Icons.sync_rounded,
                onTap: () {
                  controller.refreshServiceStatus();
                  controller.checkServerHealth();
                },
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: _QuickActionCard(
                title: 'Notifications',
                subtitle: 'Turn alerts on.',
                icon: Icons.notifications_active_rounded,
                onTap: controller.openNotificationSettings,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _QuickActionCard(
                title: 'Settings',
                subtitle: 'Open tools and server config.',
                icon: Icons.tune_rounded,
                onTap: onOpenSettings,
              ),
            ),
          ],
        ),
        const SizedBox(height: 18),
        _SectionCard(
          title: 'Recent tasks',
          subtitle: 'The latest requests that Open Bubble handled.',
          accent: const Color(0xFF2C2C2C),
          child: recentRequests.isEmpty
              ? const _EmptyState(
                  title: 'No tasks yet',
                  subtitle:
                      'Use the orb on top of another app, send a prompt, and the task will appear here.',
                )
              : Column(
                  children: [
                    for (final request in recentRequests) ...[
                      _TaskPreviewCard(request: request),
                      if (request != recentRequests.last)
                        const SizedBox(height: 10),
                    ],
                  ],
                ),
        ),
        const SizedBox(height: 14),
        if (controller.latestReplyDraft != null)
          _SectionCard(
            title: 'Latest answer',
            subtitle: 'The newest response is already on your clipboard.',
            accent: const Color(0xFF4F9D69),
            child: _LatestAnswerStrip(controller: controller),
          )
        else
          const _SectionCard(
            title: 'Latest answer',
            subtitle: 'Nothing has landed yet.',
            accent: Color(0xFF858585),
            child: _EmptyState(
              title: 'Clipboard stays clean for now',
              subtitle:
                  'As soon as a task finishes, the reply will appear here and get copied automatically.',
            ),
          ),
      ],
    );
  }
}

class _SettingsPage extends StatelessWidget {
  const _SettingsPage({
    required this.controller,
    required this.serverController,
  });

  final OpenBubbleController controller;
  final TextEditingController serverController;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final status = controller.serviceStatus;

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
      children: [
        _SectionCard(
          title: 'Connection',
          subtitle:
              'This is the only page that still behaves like a control panel.',
          accent: theme.colorScheme.primary,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              TextField(
                controller: serverController,
                decoration: const InputDecoration(
                  labelText: 'App Server base URL',
                  hintText: 'http://10.0.2.2:3000',
                  border: OutlineInputBorder(),
                ),
                onSubmitted: controller.updateServerBaseUrl,
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  FilledButton.tonalIcon(
                    onPressed: controller.checkingHealth
                        ? null
                        : () => controller.updateServerBaseUrl(
                            serverController.text,
                          ),
                    icon: const Icon(Icons.health_and_safety_rounded),
                    label: Text(
                      controller.checkingHealth
                          ? 'Checking...'
                          : 'Check health',
                    ),
                  ),
                  const SizedBox(width: 12),
                  _PresencePill(
                    label: controller.serverHealthy ? 'online' : 'offline',
                    online: controller.serverHealthy,
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        _SectionCard(
          title: 'Runtime',
          subtitle:
              'Android accessibility keeps the orb available over other apps.',
          accent: const Color(0xFF6F6F6F),
          child: Wrap(
            spacing: 12,
            runSpacing: 12,
            children: [
              _StatusPill(
                label: status.accessibilityEnabled ? 'Enabled' : 'Needs setup',
                color: status.accessibilityEnabled
                    ? const Color(0xFFD8F0E0)
                    : const Color(0xFFE7DFC6),
              ),
              _StatusPill(
                label: status.serviceConnected ? 'Connected' : 'Disconnected',
                color: status.serviceConnected
                    ? const Color(0xFFE8E8E8)
                    : const Color(0xFFD6D6D6),
              ),
              _StatusPill(
                label: status.windowScopedCaptureSupported
                    ? 'Window capture ready'
                    : status.captureSupported
                    ? 'Display capture ready'
                    : 'Capture unavailable',
                color: status.captureSupported
                    ? const Color(0xFFEDEDED)
                    : const Color(0xFFE2D8C6),
              ),
              _StatusPill(
                label: 'SDK ${status.sdkInt}',
                color: const Color(0xFFE9E9E9),
              ),
            ],
          ),
        ),
        if (status.note?.isNotEmpty == true) ...[
          const SizedBox(height: 12),
          Text(
            status.note!,
            style: theme.textTheme.bodyLarge?.copyWith(
              color: const Color(0xFF5B6470),
            ),
          ),
        ],
        if (status.systemShortcutAssigned) ...[
          const SizedBox(height: 14),
          _SectionCard(
            title: 'Android shortcut conflict',
            subtitle:
                'Android can attach this service to its own accessibility shortcut button. That system shortcut is not the Open Bubble overlay and can disable the runtime if tapped.',
            accent: const Color(0xFFB42318),
            child: Text(
              'If you see a separate Android accessibility floating shortcut, turn it off in Accessibility settings. Then use Open Bubble\'s own Show Bubble action.',
              style: theme.textTheme.bodyLarge,
            ),
          ),
        ],
        const SizedBox(height: 14),
        _MetricsRow(
          children: [
            _MiniMetricCard(
              title: 'Accessibility',
              value: status.accessibilityEnabled ? 'On' : 'Off',
              detail: 'Required for inspect, capture, and fill actions.',
            ),
            _MiniMetricCard(
              title: 'Bubble',
              value: status.bubbleVisible ? 'Visible' : 'Hidden',
              detail: 'Rendered as a trusted accessibility overlay.',
            ),
            _MiniMetricCard(
              title: 'Notifications',
              value: status.notificationsEnabled ? 'On' : 'Off',
              detail:
                  'Optional for background alerts; clipboard delivery still works without them.',
            ),
            _MiniMetricCard(
              title: 'App Server',
              value: controller.serverHealthy ? 'Reachable' : 'Offline',
              detail: 'Used for prompt uploads and task polling.',
            ),
          ],
        ),
        const SizedBox(height: 14),
        _SectionCard(
          title: 'Settings + developer tools',
          subtitle:
              'Important actions stay here so the home screen can stay quiet.',
          accent: theme.colorScheme.secondary,
          child: ExpansionTile(
            tilePadding: EdgeInsets.zero,
            childrenPadding: EdgeInsets.zero,
            title: Text('Open tools', style: theme.textTheme.titleMedium),
            subtitle: const Text(
              'Accessibility, notifications, bubble controls, and inspection.',
            ),
            children: [
              const SizedBox(height: 14),
              Wrap(
                spacing: 12,
                runSpacing: 12,
                children: [
                  FilledButton.icon(
                    onPressed: controller.openAccessibilitySettings,
                    icon: const Icon(Icons.accessibility_new_rounded),
                    label: const Text('Enable service'),
                  ),
                  FilledButton.tonalIcon(
                    onPressed: controller.refreshServiceStatus,
                    icon: const Icon(Icons.refresh_rounded),
                    label: const Text('Refresh'),
                  ),
                  FilledButton.tonalIcon(
                    onPressed: controller.showBubble,
                    icon: const Icon(Icons.radio_button_checked_rounded),
                    label: const Text('Show bubble'),
                  ),
                  OutlinedButton.icon(
                    onPressed: controller.hideBubble,
                    icon: const Icon(Icons.cancel_presentation_rounded),
                    label: const Text('Hide bubble'),
                  ),
                  OutlinedButton.icon(
                    onPressed: controller.openNotificationSettings,
                    icon: const Icon(Icons.notifications_active_rounded),
                    label: const Text('Notifications'),
                  ),
                  OutlinedButton.icon(
                    onPressed: controller.inspectActiveWindow,
                    icon: const Icon(Icons.find_in_page_rounded),
                    label: const Text('Inspect window'),
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        _SectionCard(
          title: 'Android note',
          subtitle:
              'On some Android 13+ devices, especially Pixels, sideloaded apps can show a grayed-out accessibility toggle until the user explicitly allows restricted settings for the app.',
          accent: const Color(0xFF858585),
          child: Text(
            'If the accessibility toggle is disabled, open Android settings → Apps → Open Bubble → the three-dot menu → Allow restricted settings, then try again.',
            style: theme.textTheme.bodyLarge,
          ),
        ),
      ],
    );
  }
}

class _TasksPage extends StatelessWidget {
  const _TasksPage({required this.controller, required this.sandboxController});

  final OpenBubbleController controller;
  final TextEditingController sandboxController;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final session = controller.selectedSession;
    final recentRequests = controller.requests.take(5).toList();

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
      children: [
        _SectionCard(
          title: 'Task stream',
          subtitle:
              'Recent requests, active session context, and the latest answer.',
          accent: theme.colorScheme.primary,
          child: recentRequests.isEmpty
              ? const _EmptyState(
                  title: 'Nothing is running yet',
                  subtitle:
                      'Send a prompt from the orb and the task pipeline will show up here.',
                )
              : Column(
                  children: [
                    for (final request in recentRequests) ...[
                      _RequestJobRow(
                        request: request,
                        selected:
                            request.requestId == controller.activeRequestId,
                      ),
                      if (request != recentRequests.last)
                        const SizedBox(height: 10),
                    ],
                  ],
                ),
        ),
        const SizedBox(height: 14),
        _SectionCard(
          title: 'Active sessions',
          subtitle:
              'The session list is still here, just no longer the first thing you see.',
          accent: const Color(0xFF6F6F6F),
          child: Column(
            children: [
              for (final item in controller.sessions) ...[
                _SessionTile(
                  session: item,
                  selected: item.id == controller.selectedSessionId,
                  onTap: () => controller.selectSession(item.id),
                ),
                if (item != controller.sessions.last)
                  const SizedBox(height: 10),
              ],
            ],
          ),
        ),
        const SizedBox(height: 14),
        if (session != null)
          _SectionCard(
            title: session.title,
            subtitle: session.summary,
            accent: const Color(0xFF8D8D8D),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Current task', style: theme.textTheme.titleMedium),
                const SizedBox(height: 6),
                Text(session.currentTask),
                const SizedBox(height: 12),
                Text(
                  'Use the floating bubble on top of another app: tap `Ask` or long-press, type your prompt, and send it. Open Bubble captures the screen, sends it, and waits for the answer.',
                  style: theme.textTheme.bodyMedium,
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 12,
                  runSpacing: 12,
                  children: [
                    FilledButton.tonalIcon(
                      onPressed: controller.inspectActiveWindow,
                      icon: const Icon(Icons.view_quilt_rounded),
                      label: const Text('Inspect Now'),
                    ),
                    FilledButton.tonalIcon(
                      onPressed: controller.showBubble,
                      icon: const Icon(Icons.radio_button_checked_rounded),
                      label: const Text('Show Bubble'),
                    ),
                    OutlinedButton.icon(
                      onPressed: controller.openNotificationSettings,
                      icon: const Icon(Icons.notifications_active_rounded),
                      label: const Text('Notifications'),
                    ),
                  ],
                ),
              ],
            ),
          ),
        if (session != null) const SizedBox(height: 14),
        if (controller.latestInspection != null)
          _SectionCard(
            title: 'Latest inspection',
            subtitle:
                'This snapshot comes from the accessibility runtime and shows what Open Bubble can read from the current window.',
            accent: const Color(0xFF6C6C6C),
            child: _InspectionPreview(snapshot: controller.latestInspection!),
          ),
        if (controller.latestInspection != null) const SizedBox(height: 14),
        if (controller.latestCapture != null)
          _SectionCard(
            title: 'Latest capture',
            subtitle:
                'The native runtime reports the package, dimensions, request ID, and cached image path.',
            accent: const Color(0xFF8A8A8A),
            child: _CapturePreview(capture: controller.latestCapture!),
          ),
        if (controller.latestCapture != null) const SizedBox(height: 14),
        _SectionCard(
          title: 'Latest reply',
          subtitle:
              'Review, copy, or verify fill from the freshest server response.',
          accent: const Color(0xFF4F9D69),
          child: controller.latestReplyDraft == null
              ? const _EmptyState(
                  title: 'No reply draft yet',
                  subtitle:
                      'Once a task finishes, the response will show up here and on the clipboard.',
                )
              : _ReplyDraftCard(
                  controller: controller,
                  sandboxController: sandboxController,
                ),
        ),
        const SizedBox(height: 14),
        _SectionCard(
          title: 'Timeline',
          subtitle: 'Recent app, bubble, and server events.',
          accent: const Color(0xFF858585),
          child: controller.timeline.isEmpty
              ? const Text('No activity yet.')
              : Column(
                  children: [
                    for (final entry in controller.timeline) ...[
                      _TimelineRow(entry: entry),
                      if (entry != controller.timeline.last)
                        const Divider(height: 20),
                    ],
                  ],
                ),
        ),
      ],
    );
  }
}

class _HeroDeck extends StatelessWidget {
  const _HeroDeck({required this.controller});

  final OpenBubbleController controller;

  @override
  Widget build(BuildContext context) {
    final service = controller.serviceStatus;
    final connected = controller.serverHealthy && service.serviceConnected;

    return Container(
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(28),
        gradient: const LinearGradient(
          colors: [Color(0xFF131313), Color(0xFF2A2A2A)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        boxShadow: const [
          BoxShadow(
            color: Color(0x26000000),
            blurRadius: 34,
            offset: Offset(0, 18),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Expanded(
                child: _HeaderTag(label: 'OBIE // mobile copilot'),
              ),
              const SizedBox(width: 12),
              _PresencePill(
                label: connected ? 'online' : 'offline',
                online: connected,
                compact: true,
              ),
            ],
          ),
          const SizedBox(height: 18),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Expanded(
                child: _IdentityBlock(
                  eyebrow: 'Open Bubble',
                  title: 'Welcome back, Adi',
                  subtitle:
                      'A quiet home base for the orb, your recent tasks, and a live server connection.',
                ),
              ),
              const SizedBox(width: 16),
              const _LogoCoin(),
            ],
          ),
          const SizedBox(height: 18),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              _StatusPill(
                label: service.serviceConnected
                    ? 'Runtime connected'
                    : 'Runtime waiting',
                color: service.serviceConnected
                    ? const Color(0xFFB8F0C8)
                    : const Color(0xFFE9D2A2),
              ),
              _StatusPill(
                label: controller.serverHealthy
                    ? 'Codex server reachable'
                    : 'Server needs attention',
                color: controller.serverHealthy
                    ? const Color(0xFFE6E6E6)
                    : const Color(0xFFD6D6D6),
              ),
              _StatusPill(
                label: controller.latestReplyDraft == null
                    ? 'Waiting for a reply'
                    : 'Latest reply ready',
                color: const Color(0xFFF3F3F3),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _GlassCard extends StatelessWidget {
  const _GlassCard({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.95),
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: const Color(0x16000000)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x12000000),
            blurRadius: 24,
            offset: Offset(0, 14),
          ),
        ],
      ),
      child: child,
    );
  }
}

class _IdentityBlock extends StatelessWidget {
  const _IdentityBlock({
    required this.eyebrow,
    required this.title,
    required this.subtitle,
  });

  final String eyebrow;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          eyebrow,
          style: theme.textTheme.labelLarge?.copyWith(
            letterSpacing: 0.8,
            color: Colors.white.withValues(alpha: 0.64),
          ),
        ),
        const SizedBox(height: 12),
        Text(
          title,
          style: theme.textTheme.displaySmall?.copyWith(color: Colors.white),
        ),
        const SizedBox(height: 10),
        Text(
          subtitle,
          style: theme.textTheme.bodyLarge?.copyWith(
            color: Colors.white.withValues(alpha: 0.82),
          ),
        ),
      ],
    );
  }
}

class _LogoCoin extends StatelessWidget {
  const _LogoCoin();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 74,
      height: 74,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        boxShadow: const [
          BoxShadow(
            color: Color(0x1A000000),
            blurRadius: 18,
            offset: Offset(0, 10),
          ),
        ],
      ),
      child: Container(
        margin: const EdgeInsets.all(7),
        decoration: BoxDecoration(
          color: const Color(0xFF121212),
          borderRadius: BorderRadius.circular(18),
        ),
        child: const Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              '<•>',
              style: TextStyle(
                color: Colors.white,
                fontSize: 24,
                fontWeight: FontWeight.w800,
                letterSpacing: -1.5,
              ),
            ),
            SizedBox(height: 2),
            Text(
              'OB',
              style: TextStyle(
                color: Colors.white,
                fontSize: 16,
                fontWeight: FontWeight.w900,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PresencePill extends StatelessWidget {
  const _PresencePill({
    required this.label,
    required this.online,
    this.compact = false,
  });

  final String label;
  final bool online;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final background = compact
        ? Colors.white.withValues(alpha: 0.12)
        : Colors.white;
    final foreground = compact ? Colors.white : const Color(0xFF111111);
    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: compact ? 10 : 12,
        vertical: compact ? 7 : 8,
      ),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(
          color: compact
              ? Colors.white.withValues(alpha: 0.12)
              : const Color(0x16000000),
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(
              color: online ? const Color(0xFF59C378) : const Color(0xFFB0B0B0),
              borderRadius: BorderRadius.circular(999),
              boxShadow: [
                BoxShadow(
                  color:
                      (online
                              ? const Color(0xFF59C378)
                              : const Color(0xFFB0B0B0))
                          .withValues(alpha: 0.45),
                  blurRadius: 8,
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(
            label,
            style: Theme.of(
              context,
            ).textTheme.labelLarge?.copyWith(color: foreground),
          ),
        ],
      ),
    );
  }
}

class _QuietPill extends StatelessWidget {
  const _QuietPill({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: const Color(0xFFF4F4F2),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: const Color(0x14000000)),
      ),
      child: Text(label, style: Theme.of(context).textTheme.labelLarge),
    );
  }
}

class _QuickActionCard extends StatelessWidget {
  const _QuickActionCard({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.onTap,
  });

  final String title;
  final String subtitle;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(24),
      child: Ink(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: const Color(0x15000000)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                color: const Color(0xFF171717),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(icon, color: Colors.white, size: 20),
            ),
            const SizedBox(height: 16),
            Text(title, style: theme.textTheme.titleMedium),
            const SizedBox(height: 6),
            Text(
              subtitle,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: const Color(0xFF575757),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TaskPreviewCard extends StatelessWidget {
  const _TaskPreviewCard({required this.request});

  final RequestJob request;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFFF8F8F6),
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: const Color(0x14000000)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  request.sessionTitle,
                  style: theme.textTheme.titleMedium,
                ),
              ),
              _StatusPill(
                label: request.stageLabel,
                color: _requestStageColor(request.stage),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            request.detail,
            style: theme.textTheme.bodyMedium?.copyWith(
              color: const Color(0xFF575757),
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: Text(
                  request.updatedAt,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: const Color(0xFF7A7A7A),
                  ),
                ),
              ),
              Text(
                '#${request.requestId.substring(0, 8)}',
                style: theme.textTheme.labelLarge?.copyWith(
                  color: const Color(0xFF7A7A7A),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _LatestAnswerStrip extends StatelessWidget {
  const _LatestAnswerStrip({required this.controller});

  final OpenBubbleController controller;

  @override
  Widget build(BuildContext context) {
    final draft = controller.latestReplyDraft!;
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(draft.title, style: theme.textTheme.titleMedium),
        const SizedBox(height: 10),
        Text(
          draft.replyText,
          maxLines: 4,
          overflow: TextOverflow.ellipsis,
          style: theme.textTheme.bodyLarge?.copyWith(
            color: const Color(0xFF4A4A4A),
          ),
        ),
        const SizedBox(height: 14),
        Wrap(
          spacing: 10,
          runSpacing: 10,
          children: [
            FilledButton.icon(
              onPressed: controller.copyLatestSuggestion,
              icon: const Icon(Icons.content_copy_rounded),
              label: const Text('Copy'),
            ),
            FilledButton.tonalIcon(
              onPressed: controller.fillLatestSuggestion,
              icon: const Icon(Icons.edit_rounded),
              label: const Text('Fill'),
            ),
          ],
        ),
      ],
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.title, required this.subtitle});

  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: const Color(0xFFF8F8F6),
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: const Color(0x14000000)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: theme.textTheme.titleMedium),
          const SizedBox(height: 8),
          Text(
            subtitle,
            style: theme.textTheme.bodyMedium?.copyWith(
              color: const Color(0xFF575757),
            ),
          ),
        ],
      ),
    );
  }
}

class _ReplyDraftCard extends StatelessWidget {
  const _ReplyDraftCard({
    required this.controller,
    required this.sandboxController,
  });

  final OpenBubbleController controller;
  final TextEditingController sandboxController;

  @override
  Widget build(BuildContext context) {
    final draft = controller.latestReplyDraft!;
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(draft.title, style: theme.textTheme.titleLarge),
        const SizedBox(height: 8),
        Text(draft.replyText),
        const SizedBox(height: 14),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: const Color(0xFFF8F8F6),
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: const Color(0x14000000)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Text('Fill preview', style: theme.textTheme.titleMedium),
                  const Spacer(),
                  _StatusPill(
                    label: draft.confidence.toUpperCase(),
                    color: const Color(0xFFE7E7E7),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Text(draft.fillSuggestion),
            ],
          ),
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: draft.warnings
              .map(
                (warning) =>
                    _StatusPill(label: warning, color: const Color(0xFFEDE0C7)),
              )
              .toList(),
        ),
        const SizedBox(height: 14),
        Text('Local fill sandbox', style: theme.textTheme.titleMedium),
        const SizedBox(height: 8),
        Text(
          'This field is only here to verify the native fill path quickly during the demo.',
          style: theme.textTheme.bodyMedium,
        ),
        const SizedBox(height: 10),
        TextField(
          controller: sandboxController,
          decoration: const InputDecoration(
            labelText: 'Sandbox field',
            hintText: 'Tap here, then try Fill Focused Field',
            border: OutlineInputBorder(),
          ),
          minLines: 2,
          maxLines: 3,
        ),
        const SizedBox(height: 14),
        Wrap(
          spacing: 12,
          runSpacing: 12,
          children: [
            FilledButton.icon(
              onPressed: controller.fillLatestSuggestion,
              icon: const Icon(Icons.edit_rounded),
              label: const Text('Fill Focused Field'),
            ),
            FilledButton.tonalIcon(
              onPressed: controller.copyLatestSuggestion,
              icon: const Icon(Icons.content_copy_rounded),
              label: const Text('Copy Text'),
            ),
          ],
        ),
      ],
    );
  }
}

class _InspectionPreview extends StatelessWidget {
  const _InspectionPreview({required this.snapshot});

  final WindowSnapshot snapshot;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            _StatusPill(
              label: snapshot.packageName,
              color: const Color(0xFFD7EDE1),
            ),
            _StatusPill(
              label: '${snapshot.windowCount} windows',
              color: const Color(0xFFF3E8FF),
            ),
            if (snapshot.focusedField != null)
              _StatusPill(
                label: snapshot.focusedField!.label.isNotEmpty
                    ? snapshot.focusedField!.label
                    : snapshot.focusedField!.hint,
                color: const Color(0xFFFDE7D5),
              ),
          ],
        ),
        const SizedBox(height: 12),
        Text(
          snapshot.visibleText.isEmpty
              ? 'No visible text was captured.'
              : snapshot.visibleText.take(6).join('\n'),
        ),
      ],
    );
  }
}

class _CapturePreview extends StatelessWidget {
  const _CapturePreview({required this.capture});

  final CaptureSnapshot capture;

  @override
  Widget build(BuildContext context) {
    final previewFile = capture.filePath.startsWith('/')
        ? File(capture.filePath)
        : null;
    final canPreview = previewFile?.existsSync() ?? false;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: 10,
          runSpacing: 10,
          children: [
            _StatusPill(
              label: capture.requestId,
              color: const Color(0xFFD7EDE1),
            ),
            _StatusPill(
              label: '${capture.width}×${capture.height}',
              color: const Color(0xFFFDE7D5),
            ),
            _StatusPill(label: capture.source, color: const Color(0xFFF3E8FF)),
            _StatusPill(
              label: capture.packageName,
              color: const Color(0xFFFAEBD7),
            ),
          ],
        ),
        if (canPreview) ...[
          const SizedBox(height: 14),
          ClipRRect(
            borderRadius: BorderRadius.circular(18),
            child: Image.file(
              previewFile!,
              fit: BoxFit.cover,
              height: 220,
              width: double.infinity,
            ),
          ),
        ],
      ],
    );
  }
}

class _RequestJobRow extends StatelessWidget {
  const _RequestJobRow({required this.request, required this.selected});

  final RequestJob request;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    final borderColor = selected
        ? const Color(0xFF7C3AED)
        : const Color(0x14000000);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: selected ? const Color(0xFFF6F1FF) : Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: borderColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  request.sessionTitle,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
              _StatusPill(
                label: request.stageLabel,
                color: _requestStageColor(request.stage),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(request.detail),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _StatusPill(
                label: request.requestId,
                color: const Color(0xFFEDEDED),
              ),
              if (request.usesMockCapture)
                const _StatusPill(
                  label: 'mock capture',
                  color: Color(0xFFECE2D4),
                ),
              _StatusPill(
                label: request.updatedAt,
                color: const Color(0xFFF0F0ED),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _TimelineRow extends StatelessWidget {
  const _TimelineRow({required this.entry});

  final TimelineEntry entry;

  @override
  Widget build(BuildContext context) {
    final color = switch (entry.tone) {
      TimelineTone.success => const Color(0xFF2F855A),
      TimelineTone.warning => const Color(0xFF8A6A2F),
      TimelineTone.error => const Color(0xFFB42318),
      TimelineTone.info => const Color(0xFF3D3D3D),
    };

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 11,
          height: 11,
          margin: const EdgeInsets.only(top: 5),
          decoration: BoxDecoration(
            color: color,
            borderRadius: BorderRadius.circular(999),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(entry.title, style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 4),
              Text(entry.detail),
              const SizedBox(height: 4),
              Text(
                entry.timestamp,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: const Color(0xFF5B6470),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

Color _requestStageColor(RequestStage stage) {
  return switch (stage) {
    RequestStage.queued => const Color(0xFFE7E5E4),
    RequestStage.capturing => const Color(0xFFECE2D4),
    RequestStage.uploading => const Color(0xFFE2E2E2),
    RequestStage.drafting => const Color(0xFFDADADA),
    RequestStage.ready => const Color(0xFFD8F0E0),
    RequestStage.failed => const Color(0xFFF0DDDD),
  };
}

class _SessionTile extends StatelessWidget {
  const _SessionTile({
    required this.session,
    required this.selected,
    required this.onTap,
  });

  final SessionSummary session;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: Ink(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: selected ? const Color(0xFFF1F1EF) : Colors.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: selected
                ? theme.colorScheme.primary
                : const Color(0x14000000),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    session.title,
                    style: theme.textTheme.titleMedium,
                  ),
                ),
                _StatusPill(
                  label: session.status,
                  color: selected
                      ? const Color(0xFFE8E8E8)
                      : const Color(0xFFF3F3F3),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(session.summary, style: theme.textTheme.bodyMedium),
            const SizedBox(height: 8),
            Text(
              '${session.agentKind} • ${session.updatedAt}',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: const Color(0xFF5B6470),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({
    required this.title,
    required this.subtitle,
    required this.accent,
    required this.child,
  });

  final String title;
  final String subtitle;
  final Color accent;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.96),
        borderRadius: BorderRadius.circular(26),
        border: Border.all(color: accent.withValues(alpha: 0.16)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x12000000),
            blurRadius: 20,
            offset: Offset(0, 12),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 12,
                height: 12,
                margin: const EdgeInsets.only(top: 5),
                decoration: BoxDecoration(
                  color: accent,
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: theme.textTheme.titleLarge),
                    const SizedBox(height: 6),
                    Text(
                      subtitle,
                      style: theme.textTheme.bodyLarge?.copyWith(
                        color: const Color(0xFF38424C),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          child,
        ],
      ),
    );
  }
}

class _MetricsRow extends StatelessWidget {
  const _MetricsRow({required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final wide = constraints.maxWidth >= 720;
        if (wide) {
          return Row(
            children: [
              for (var index = 0; index < children.length; index++) ...[
                Expanded(child: children[index]),
                if (index != children.length - 1) const SizedBox(width: 12),
              ],
            ],
          );
        }

        return Column(
          children: [
            for (var index = 0; index < children.length; index++) ...[
              children[index],
              if (index != children.length - 1) const SizedBox(height: 12),
            ],
          ],
        );
      },
    );
  }
}

class _MiniMetricCard extends StatelessWidget {
  const _MiniMetricCard({
    required this.title,
    required this.value,
    required this.detail,
  });

  final String title;
  final String value;
  final String detail;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.96),
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: const Color(0x12000000)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: theme.textTheme.titleMedium),
          const SizedBox(height: 6),
          Text(
            value,
            style: theme.textTheme.headlineSmall?.copyWith(fontSize: 23),
          ),
          const SizedBox(height: 6),
          Text(detail, style: theme.textTheme.bodyMedium),
        ],
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: Theme.of(
          context,
        ).textTheme.labelLarge?.copyWith(color: const Color(0xFF111111)),
      ),
    );
  }
}

class _HeaderTag extends StatelessWidget {
  const _HeaderTag({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.16),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: Theme.of(
          context,
        ).textTheme.labelLarge?.copyWith(color: Colors.white),
      ),
    );
  }
}

class _BackdropOrbs extends StatelessWidget {
  const _BackdropOrbs();

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Stack(
        children: [
          Positioned(
            left: -80,
            top: -40,
            child: _Orb(diameter: 220, color: const Color(0x15000000)),
          ),
          Positioned(
            right: -60,
            top: 160,
            child: _Orb(diameter: 180, color: const Color(0x11000000)),
          ),
          Positioned(
            bottom: -80,
            left: 40,
            child: _Orb(diameter: 240, color: const Color(0x10000000)),
          ),
        ],
      ),
    );
  }
}

class _Orb extends StatelessWidget {
  const _Orb({required this.diameter, required this.color});

  final double diameter;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: diameter,
      height: diameter,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: RadialGradient(colors: [color, color.withValues(alpha: 0.0)]),
      ),
    );
  }
}
