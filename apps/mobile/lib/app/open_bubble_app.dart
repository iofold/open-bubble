import 'package:flutter/material.dart';

import '../state/open_bubble_controller.dart';
import 'open_bubble_home.dart';

class OpenBubbleApp extends StatefulWidget {
  const OpenBubbleApp({super.key, this.controller, this.autoInitialize = true});

  final OpenBubbleController? controller;
  final bool autoInitialize;

  @override
  State<OpenBubbleApp> createState() => _OpenBubbleAppState();
}

class _OpenBubbleAppState extends State<OpenBubbleApp>
    with WidgetsBindingObserver {
  late final OpenBubbleController controller;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    controller = widget.controller ?? OpenBubbleController();
    if (widget.autoInitialize) {
      controller.initialize();
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && widget.autoInitialize) {
      controller.handleAppResumed();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    const background = Color(0xFFF2F1EC);
    const canvas = Color(0xFFFFFEFC);
    const ink = Color(0xFF111111);
    const graphite = Color(0xFF262626);
    const silver = Color(0xFF8D8D8D);
    const signal = Color(0xFF4F9D69);

    return MaterialApp(
      title: 'Open Bubble',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: const ColorScheme.light(
          primary: graphite,
          secondary: silver,
          tertiary: signal,
          surface: canvas,
          onSurface: ink,
        ),
        scaffoldBackgroundColor: background,
        useMaterial3: true,
        fontFamily: 'monospace',
        textTheme: ThemeData.light().textTheme.copyWith(
          displaySmall: const TextStyle(
            fontFamily: 'monospace',
            fontSize: 34,
            fontWeight: FontWeight.w800,
            height: 1.05,
            color: ink,
          ),
          headlineSmall: const TextStyle(
            fontFamily: 'monospace',
            fontSize: 28,
            fontWeight: FontWeight.w800,
            color: ink,
          ),
          titleLarge: const TextStyle(
            fontFamily: 'monospace',
            fontSize: 20,
            fontWeight: FontWeight.w700,
            color: ink,
          ),
          titleMedium: const TextStyle(
            fontFamily: 'monospace',
            fontSize: 16,
            fontWeight: FontWeight.w700,
            color: ink,
          ),
          bodyLarge: const TextStyle(
            fontFamily: 'monospace',
            fontSize: 15,
            height: 1.5,
            color: ink,
          ),
          bodyMedium: const TextStyle(
            fontFamily: 'monospace',
            fontSize: 13,
            height: 1.45,
            color: ink,
          ),
          labelLarge: const TextStyle(
            fontFamily: 'monospace',
            fontSize: 13,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
      home: OpenBubbleHome(controller: controller),
    );
  }
}
