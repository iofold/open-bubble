import 'dart:ui';

import 'package:flutter/cupertino.dart';
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
          _HomePage(controller: controller),
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
            decoration: const BoxDecoration(color: Color(0xFF111111)),
            child: Stack(
              children: [
                const _BackdropOrbs(),
                SafeArea(
                  child: Stack(
                    children: [
                      Positioned.fill(
                        child: AnimatedSwitcher(
                          duration: const Duration(milliseconds: 250),
                          child: KeyedSubtree(
                            key: ValueKey<int>(_tabIndex),
                            child: pages[_tabIndex],
                          ),
                        ),
                      ),
                      Positioned(
                        left: 20,
                        right: 20,
                        bottom: 16,
                        child: _FloatingNavBar(
                          selectedIndex: _tabIndex,
                          onSelected: (index) {
                            setState(() {
                              _tabIndex = index;
                            });
                          },
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
  const _HomePage({required this.controller});

  final OpenBubbleController controller;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final service = controller.serviceStatus;
    final online = controller.serverHealthy && service.serviceConnected;

    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 24, 24, 116),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const _HeaderTag(label: 'OBIE // mobile copilot'),
              const Spacer(),
              _PresencePill(
                label: online ? 'online' : 'offline',
                online: online,
                compact: true,
              ),
            ],
          ),
          const Spacer(),
          const _LargeLogoCoin(),
          const SizedBox(height: 32),
          Text(
            'Welcome back, Aadi',
            style: theme.textTheme.displaySmall?.copyWith(
              color: Colors.white,
              fontSize: 42,
              height: 0.98,
            ),
          ),
          const SizedBox(height: 18),
          Text(
            online
                ? 'Your OB is live & connected to the Codex server.'
                : 'Your OB is waiting to reconnect to the Codex server.',
            style: theme.textTheme.titleLarge?.copyWith(
              color: Colors.white.withValues(alpha: 0.84),
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 26),
          _BubblePowerSwitch(
            enabled: service.serviceConnected,
            isOn: service.bubbleVisible,
            onChanged: (value) async {
              if (value) {
                await controller.showBubble();
              } else {
                await controller.hideBubble();
              }
            },
            onDisabledTap: () async {
              await controller.openAccessibilitySettings();
            },
          ),
          const Spacer(),
        ],
      ),
    );
  }
}

class _FloatingNavBar extends StatelessWidget {
  const _FloatingNavBar({
    required this.selectedIndex,
    required this.onSelected,
  });

  final int selectedIndex;
  final ValueChanged<int> onSelected;

  @override
  Widget build(BuildContext context) {
    const items = <({IconData icon, String label})>[
      (icon: Icons.home_rounded, label: 'Home'),
      (icon: Icons.schedule_rounded, label: 'Tasks'),
      (icon: Icons.tune_rounded, label: 'Tools'),
    ];

    return ClipRRect(
      borderRadius: BorderRadius.circular(26),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 22, sigmaY: 22),
        child: Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: const Color(0xCC181818),
            borderRadius: BorderRadius.circular(26),
            border: Border.all(color: const Color(0x22FFFFFF)),
            boxShadow: const [
              BoxShadow(
                color: Color(0x40000000),
                blurRadius: 30,
                offset: Offset(0, 18),
              ),
            ],
          ),
          child: Row(
            children: [
              for (var index = 0; index < items.length; index++) ...[
                Expanded(
                  child: _NavItem(
                    icon: items[index].icon,
                    label: items[index].label,
                    selected: selectedIndex == index,
                    onTap: () => onSelected(index),
                  ),
                ),
                if (index != items.length - 1) const SizedBox(width: 8),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _BubblePowerSwitch extends StatelessWidget {
  const _BubblePowerSwitch({
    required this.enabled,
    required this.isOn,
    required this.onChanged,
    required this.onDisabledTap,
  });

  final bool enabled;
  final bool isOn;
  final ValueChanged<bool> onChanged;
  final Future<void> Function() onDisabledTap;

  @override
  Widget build(BuildContext context) {
    final label = isOn ? 'OB ON' : 'OB OFF';
    final detail = enabled
        ? (isOn ? 'Bubble is live.' : 'Turn on the floating orb.')
        : 'Enable accessibility in Tools first.';

    return GestureDetector(
      onTap: enabled
          ? () => onChanged(!isOn)
          : () {
              onDisabledTap();
            },
      child: Container(
        padding: const EdgeInsets.fromLTRB(18, 16, 16, 16),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.06),
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      color: isOn
                          ? const Color(0xFF8EF0A8)
                          : const Color(0xFFFF9B9B),
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    detail,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: Colors.white.withValues(alpha: 0.62),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            Opacity(
              opacity: enabled ? 1 : 0.55,
              child: CupertinoSwitch(
                value: isOn,
                onChanged: enabled
                    ? onChanged
                    : (_) {
                        onDisabledTap();
                      },
                activeTrackColor: const Color(0xFF59C378),
                inactiveTrackColor: const Color(0xFFC45454),
                thumbColor: Colors.white,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  const _NavItem({
    required this.icon,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final foreground = selected ? const Color(0xFF111111) : Colors.white;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(18),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            color: selected
                ? Colors.white
                : Colors.white.withValues(alpha: 0.02),
            borderRadius: BorderRadius.circular(18),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 18, color: foreground),
              const SizedBox(width: 8),
              Flexible(
                child: Text(
                  label,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(
                    context,
                  ).textTheme.labelLarge?.copyWith(color: foreground),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _LargeLogoCoin extends StatelessWidget {
  const _LargeLogoCoin();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 110,
      height: 110,
      decoration: BoxDecoration(
        color: const Color(0xFFF7F7F5),
        borderRadius: BorderRadius.circular(34),
        boxShadow: const [
          BoxShadow(
            color: Color(0x33000000),
            blurRadius: 30,
            offset: Offset(0, 20),
          ),
        ],
      ),
      child: Container(
        margin: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: const Color(0xFF0D0D0D),
          borderRadius: BorderRadius.circular(26),
        ),
        child: const Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              '<•>',
              style: TextStyle(
                color: Colors.white,
                fontSize: 34,
                fontWeight: FontWeight.w800,
                letterSpacing: -2.1,
              ),
            ),
            SizedBox(height: 2),
            Text(
              'OB',
              style: TextStyle(
                color: Colors.white,
                fontSize: 22,
                fontWeight: FontWeight.w900,
              ),
            ),
          ],
        ),
      ),
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
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 120),
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
    final recentRequests = controller.requests.take(5).toList();

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 120),
      children: [
        _SectionCard(
          title: 'Task stream',
          subtitle: 'Recent requests moving through the Open Bubble pipeline.',
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
          title: 'History',
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
