import 'package:flutter_test/flutter_test.dart';

import 'package:mobile/main.dart';

void main() {
  testWidgets('renders accessibility-first dashboard', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(const OpenBubbleApp(autoInitialize: false));

    expect(find.text('Open Bubble'), findsOneWidget);
    expect(find.text('Accessibility-first runtime'), findsOneWidget);
    expect(find.text('Accessibility-first mobile copilot'), findsOneWidget);
  });
}
