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
    const background = Color(0xFFF4EFE6);
    const canvas = Color(0xFFFFFBF5);
    const ink = Color(0xFF172026);
    const teal = Color(0xFF0E5A63);
    const coral = Color(0xFFE07A5F);
    const moss = Color(0xFF6B8F71);

    return MaterialApp(
      title: 'Open Bubble',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: const ColorScheme.light(
          primary: teal,
          secondary: coral,
          tertiary: moss,
          surface: canvas,
          onSurface: ink,
        ),
        scaffoldBackgroundColor: background,
        useMaterial3: true,
        textTheme: ThemeData.light().textTheme.copyWith(
          displaySmall: const TextStyle(
            fontSize: 38,
            fontWeight: FontWeight.w800,
            height: 1.0,
            color: ink,
          ),
          headlineSmall: const TextStyle(
            fontSize: 28,
            fontWeight: FontWeight.w800,
            color: ink,
          ),
          titleLarge: const TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.w700,
            color: ink,
          ),
          titleMedium: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w700,
            color: ink,
          ),
          bodyLarge: const TextStyle(fontSize: 15, height: 1.45, color: ink),
          bodyMedium: const TextStyle(fontSize: 13, height: 1.4, color: ink),
          labelLarge: const TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
      home: OpenBubbleHome(controller: controller),
    );
  }
}
