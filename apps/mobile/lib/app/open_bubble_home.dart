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
  int _tabIndex = 0;

  @override
  void initState() {
    super.initState();
    _serverController = TextEditingController(
      text: widget.controller.serverBaseUrl,
    );
  }

  @override
  void dispose() {
    _serverController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return AnimatedBuilder(
      animation: widget.controller,
      builder: (context, child) {
        final controller = widget.controller;
        final pages = <Widget>[
          _SetupPage(
            controller: controller,
            serverController: _serverController,
          ),
          _SessionsPage(controller: controller),
          _ReviewPage(controller: controller),
        ];

        return Scaffold(
          body: DecoratedBox(
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                colors: [Color(0xFFF4EFE6), Color(0xFFF9F6F0)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
            ),
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
                              icon: Icon(Icons.tune_rounded),
                              label: Text('Setup'),
                            ),
                            ButtonSegment<int>(
                              value: 1,
                              icon: Icon(Icons.bubble_chart_rounded),
                              label: Text('Sessions'),
                            ),
                            ButtonSegment<int>(
                              value: 2,
                              icon: Icon(Icons.inventory_2_rounded),
                              label: Text('Review'),
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
                            foregroundColor: theme.colorScheme.onSurface,
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

class _SetupPage extends StatelessWidget {
  const _SetupPage({required this.controller, required this.serverController});

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
          title: 'Accessibility-first runtime',
          subtitle:
              'Open Bubble uses an Android accessibility service instead of MediaProjection. That keeps repeated inspect/capture/fill flows fast after the one-time setup.',
          accent: theme.colorScheme.primary,
          child: Wrap(
            spacing: 12,
            runSpacing: 12,
            children: [
              _StatusPill(
                label: status.accessibilityEnabled ? 'Enabled' : 'Needs setup',
                color: status.accessibilityEnabled
                    ? const Color(0xFF2F855A)
                    : const Color(0xFFD97706),
              ),
              _StatusPill(
                label: status.serviceConnected ? 'Connected' : 'Disconnected',
                color: status.serviceConnected
                    ? const Color(0xFF0E5A63)
                    : const Color(0xFF8B5CF6),
              ),
              _StatusPill(
                label: status.windowScopedCaptureSupported
                    ? 'Window capture ready'
                    : status.captureSupported
                    ? 'Display capture ready'
                    : 'Capture unavailable',
                color: status.captureSupported
                    ? const Color(0xFF6B8F71)
                    : const Color(0xFFB45309),
              ),
              _StatusPill(
                label: 'SDK ${status.sdkInt}',
                color: const Color(0xFFE07A5F),
              ),
            ],
          ),
        ),
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
              title: 'App Server',
              value: controller.serverHealthy ? 'Reachable' : 'Mocked',
              detail:
                  'Requests are mocked for now; health checks can point at the real server.',
            ),
          ],
        ),
        const SizedBox(height: 14),
        _SectionCard(
          title: 'Setup actions',
          subtitle:
              'Use these to enable the service, verify native connectivity, and get the overlay onto the screen.',
          accent: theme.colorScheme.secondary,
          child: Wrap(
            spacing: 12,
            runSpacing: 12,
            children: [
              FilledButton.icon(
                onPressed: controller.openAccessibilitySettings,
                icon: const Icon(Icons.accessibility_new_rounded),
                label: const Text('Enable Service'),
              ),
              FilledButton.tonalIcon(
                onPressed: controller.refreshServiceStatus,
                icon: const Icon(Icons.refresh_rounded),
                label: const Text('Refresh Status'),
              ),
              FilledButton.tonalIcon(
                onPressed: controller.showBubble,
                icon: const Icon(Icons.radio_button_checked_rounded),
                label: const Text('Show Bubble'),
              ),
              OutlinedButton.icon(
                onPressed: controller.hideBubble,
                icon: const Icon(Icons.cancel_presentation_rounded),
                label: const Text('Hide Bubble'),
              ),
              OutlinedButton.icon(
                onPressed: controller.inspectActiveWindow,
                icon: const Icon(Icons.find_in_page_rounded),
                label: const Text('Inspect Active Window'),
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        _SectionCard(
          title: 'Connection target',
          subtitle:
              'The client can already health-check a real server URL, even though request/reply flows are still mocked in the app.',
          accent: const Color(0xFF6B8F71),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              TextField(
                controller: serverController,
                decoration: const InputDecoration(
                  labelText: 'App Server base URL',
                  hintText: 'http://10.0.2.2:8787',
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
                          : 'Check Health',
                    ),
                  ),
                  const SizedBox(width: 12),
                  _StatusPill(
                    label: controller.serverHealthy
                        ? 'Real server reachable'
                        : 'Mocked replies active',
                    color: controller.serverHealthy
                        ? const Color(0xFF2F855A)
                        : const Color(0xFFB45309),
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        _SectionCard(
          title: 'Restricted-settings note',
          subtitle:
              'On some Android 13+ devices, especially Pixels, sideloaded apps can show a grayed-out accessibility toggle until the user explicitly allows restricted settings for the app.',
          accent: const Color(0xFF7C3AED),
          child: Text(
            'If the accessibility toggle is disabled, open Android settings → Apps → Open Bubble → the three-dot menu → Allow restricted settings, then try again.',
            style: theme.textTheme.bodyLarge,
          ),
        ),
      ],
    );
  }
}

class _SessionsPage extends StatelessWidget {
  const _SessionsPage({required this.controller});

  final OpenBubbleController controller;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final session = controller.selectedSession;

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
      children: [
        _SectionCard(
          title: 'Active sessions',
          subtitle:
              'The client can already browse mocked sessions while the real App Server integration is being built.',
          accent: theme.colorScheme.primary,
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
            accent: theme.colorScheme.secondary,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Current task', style: theme.textTheme.titleMedium),
                const SizedBox(height: 6),
                Text(session.currentTask),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 12,
                  runSpacing: 12,
                  children: [
                    FilledButton.icon(
                      onPressed: controller.captureAndSend,
                      icon: const Icon(Icons.camera_rounded),
                      label: const Text('Capture & Send'),
                    ),
                    FilledButton.tonalIcon(
                      onPressed: controller.inspectActiveWindow,
                      icon: const Icon(Icons.view_quilt_rounded),
                      label: const Text('Inspect Now'),
                    ),
                    OutlinedButton.icon(
                      onPressed: controller.generateMockReply,
                      icon: const Icon(Icons.auto_awesome_rounded),
                      label: const Text('Generate Mock Reply'),
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
                'This snapshot comes from the accessibility runtime and is what the server mock currently consumes.',
            accent: const Color(0xFF0E5A63),
            child: _InspectionPreview(snapshot: controller.latestInspection!),
          ),
        if (controller.latestInspection != null) const SizedBox(height: 14),
        if (controller.latestCapture != null)
          _SectionCard(
            title: 'Latest capture',
            subtitle:
                'The native runtime reports the package, dimensions, request ID, and cached image path.',
            accent: const Color(0xFFE07A5F),
            child: _CapturePreview(capture: controller.latestCapture!),
          ),
      ],
    );
  }
}

class _ReviewPage extends StatelessWidget {
  const _ReviewPage({required this.controller});

  final OpenBubbleController controller;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
      children: [
        _SectionCard(
          title: 'Review-before-fill',
          subtitle:
              'This is the safety rail for Open Bubble. The app prepares a suggested reply, but the user still chooses whether to fill it into the focused field or just copy it.',
          accent: const Color(0xFF6B8F71),
          child: controller.latestReplyDraft == null
              ? const Text(
                  'No reply draft yet. Capture context from the Sessions tab or generate a mock reply to see the review flow.',
                )
              : _ReplyDraftCard(controller: controller),
        ),
        const SizedBox(height: 14),
        _SectionCard(
          title: 'Timeline',
          subtitle:
              'The feed below mixes Flutter actions, mocked server work, and native Android events coming back over the platform bridge.',
          accent: const Color(0xFF7C3AED),
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
    final theme = Theme.of(context);
    final service = controller.serviceStatus;

    return Container(
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(28),
        gradient: const LinearGradient(
          colors: [Color(0xFF124B56), Color(0xFF1B6C79)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        boxShadow: const [
          BoxShadow(
            color: Color(0x220E5A63),
            blurRadius: 28,
            offset: Offset(0, 18),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _HeaderTag(label: 'Accessibility-first mobile copilot'),
          const SizedBox(height: 18),
          Text(
            'Open Bubble',
            style: theme.textTheme.displaySmall?.copyWith(color: Colors.white),
          ),
          const SizedBox(height: 10),
          Text(
            'A Flutter shell backed by a native Android accessibility runtime for overlay, inspect, capture, and review-before-fill flows.',
            style: theme.textTheme.bodyLarge?.copyWith(
              color: Colors.white.withValues(alpha: 0.88),
            ),
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
                    ? const Color(0xFF7CD992)
                    : const Color(0xFFF5B971),
                textColor: const Color(0xFF0F172A),
              ),
              _StatusPill(
                label:
                    controller.selectedSession?.title ?? 'No session selected',
                color: const Color(0xFFFAEBD7),
                textColor: const Color(0xFF0F172A),
              ),
              _StatusPill(
                label: controller.latestReplyDraft == null
                    ? 'No reply draft yet'
                    : 'Review draft ready',
                color: controller.latestReplyDraft == null
                    ? const Color(0xFFCBD5E1)
                    : const Color(0xFFE9F5EC),
                textColor: const Color(0xFF0F172A),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ReplyDraftCard extends StatelessWidget {
  const _ReplyDraftCard({required this.controller});

  final OpenBubbleController controller;

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
            color: const Color(0xFFF9F6EF),
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: const Color(0x1A0E5A63)),
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
                    color: const Color(0xFFD7EDE1),
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
                    _StatusPill(label: warning, color: const Color(0xFFF7DEC0)),
              )
              .toList(),
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
    return Wrap(
      spacing: 10,
      runSpacing: 10,
      children: [
        _StatusPill(label: capture.requestId, color: const Color(0xFFD7EDE1)),
        _StatusPill(
          label: '${capture.width}×${capture.height}',
          color: const Color(0xFFFDE7D5),
        ),
        _StatusPill(label: capture.source, color: const Color(0xFFF3E8FF)),
        _StatusPill(label: capture.packageName, color: const Color(0xFFFAEBD7)),
      ],
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
      TimelineTone.warning => const Color(0xFFD97706),
      TimelineTone.error => const Color(0xFFB42318),
      TimelineTone.info => const Color(0xFF0E5A63),
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
          color: selected ? const Color(0xFFE9F3F3) : Colors.white,
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
                      ? const Color(0xFFD7EDE1)
                      : const Color(0xFFF3E8FF),
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
        border: Border.all(color: accent.withValues(alpha: 0.18)),
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
            style: theme.textTheme.headlineSmall?.copyWith(fontSize: 24),
          ),
          const SizedBox(height: 6),
          Text(detail, style: theme.textTheme.bodyMedium),
        ],
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({
    required this.label,
    required this.color,
    this.textColor = const Color(0xFF172026),
  });

  final String label;
  final Color color;
  final Color textColor;

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
        ).textTheme.labelLarge?.copyWith(color: textColor),
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
            child: _Orb(diameter: 220, color: const Color(0x30E07A5F)),
          ),
          Positioned(
            right: -60,
            top: 160,
            child: _Orb(diameter: 180, color: const Color(0x260E5A63)),
          ),
          Positioned(
            bottom: -80,
            left: 40,
            child: _Orb(diameter: 240, color: const Color(0x226B8F71)),
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
