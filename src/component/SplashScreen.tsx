import React from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

interface SplashScreenProps {
    onFinish?: () => void;
}

const splashHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta content="width=device-width, initial-scale=1.0" name="viewport">
    <title>KUKPS TALAI - Splash Screen</title>
    <!-- Material Symbols -->
    <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;display=swap" rel="stylesheet">
    <!-- Google Fonts: Inter and Manrope -->
    <link href="https://fonts.googleapis.com" rel="preconnect">
    <link crossorigin="" href="https://fonts.gstatic.com" rel="preconnect">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&amp;family=Manrope:wght@600;700&amp;display=swap" rel="stylesheet">
    <!-- Tailwind CSS -->
    <script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
    <!-- Tailwind Configuration -->
    <script id="tailwind-config">
        tailwind.config = {
            darkMode: "class",
            theme: {
                extend: {
                    "colors": {
                        "on-secondary-fixed-variant": "#394d00",
                        "surface-container-low": "#ecf5fe",
                        "inverse-on-surface": "#e9f2fb",
                        "on-background": "#141d23",
                        "primary-container": "#1b4332",
                        "on-primary": "#ffffff",
                        "on-secondary-fixed": "#151f00",
                        "surface-variant": "#dbe4ed",
                        "on-secondary-container": "#526d00",
                        "on-tertiary-fixed": "#201b0c",
                        "surface-container-highest": "#dbe4ed",
                        "on-tertiary": "#ffffff",
                        "secondary-fixed": "#ccf078",
                        "on-surface-variant": "#414844",
                        "surface-container-lowest": "#ffffff",
                        "secondary-fixed-dim": "#b0d360",
                        "secondary-container": "#ccf078",
                        "on-primary-fixed-variant": "#274e3d",
                        "primary-fixed-dim": "#a5d0b9",
                        "on-error-container": "#93000a",
                        "on-primary-container": "#86af99",
                        "error-container": "#ffdad6",
                        "inverse-surface": "#293138",
                        "surface-dim": "#d2dbe4",
                        "primary": "#012d1d",
                        "on-tertiary-fixed-variant": "#4c4634",
                        "inverse-primary": "#a5d0b9",
                        "primary-fixed": "#c1ecd4",
                        "on-secondary": "#ffffff",
                        "tertiary-fixed-dim": "#cfc6ae",
                        "surface": "#f6faff",
                        "on-surface": "#141d23",
                        "surface-bright": "#f6faff",
                        "tertiary-fixed": "#ece2c9",
                        "surface-container-high": "#e0e9f2",
                        "on-primary-fixed": "#002114",
                        "tertiary-container": "#413c2a",
                        "outline-variant": "#c1c8c2",
                        "on-error": "#ffffff",
                        "background": "#f6faff",
                        "error": "#ba1a1a",
                        "secondary": "#4d6700",
                        "on-tertiary-container": "#afa690",
                        "surface-container": "#e6eff8",
                        "outline": "#717973",
                        "tertiary": "#2b2616",
                        "surface-tint": "#3f6653"
                    },
                    "borderRadius": {
                        "DEFAULT": "0.25rem",
                        "lg": "0.5rem",
                        "xl": "0.75rem",
                        "full": "9999px"
                    },
                    "spacing": {
                        "stack-lg": "24px",
                        "container-margin-mobile": "16px",
                        "stack-sm": "4px",
                        "container-margin-desktop": "32px",
                        "base": "8px",
                        "stack-md": "12px",
                        "gutter": "16px"
                    },
                    "fontFamily": {
                        "label-caps": ["Inter"],
                        "headline-lg": ["Manrope"],
                        "headline-lg-mobile": ["Manrope"],
                        "headline-md": ["Manrope"],
                        "body-sm": ["Inter"],
                        "body-lg": ["Inter"]
                    },
                    "fontSize": {
                        "label-caps": ["12px", { "lineHeight": "16px", "letterSpacing": "0.05em", "fontWeight": "600" }],
                        "headline-lg": ["30px", { "lineHeight": "38px", "letterSpacing": "-0.02em", "fontWeight": "700" }],
                        "headline-lg-mobile": ["24px", { "lineHeight": "32px", "letterSpacing": "-0.01em", "fontWeight": "700" }],
                        "headline-md": ["20px", { "lineHeight": "28px", "fontWeight": "600" }],
                        "body-sm": ["14px", { "lineHeight": "20px", "fontWeight": "400" }],
                        "body-lg": ["16px", { "lineHeight": "24px", "fontWeight": "400" }]
                    }
                }
            }
        }
    </script>
    <style>
        @keyframes fade-in {
            0% { opacity: 0; }
            100% { opacity: 1; }
        }
        .animate-fade-in {
            animation: fade-in 1.5s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }
    </style>
</head>
<body class="text-on-primary h-screen w-full flex flex-col items-center justify-center p-container-margin-mobile overflow-hidden relative bg-primary-container" style="background-color: rgb(27, 67, 50);">
    <!-- Center Content: Logo -->
    <div class="flex flex-col items-center justify-center z-10 w-full max-w-sm mx-auto">
        <!-- Logo Image -->
        <div class="w-48 h-48 sm:w-56 sm:h-56 md:w-64 md:h-64 relative animate-fade-in">
            <div class="absolute inset-0 bg-primary-fixed-dim/20 rounded-full blur-xl scale-110"></div>
            <img alt="KUKPS TALAI Logo" class="w-full h-full object-contain relative z-10 drop-shadow-2xl" src="https://lh3.googleusercontent.com/aida-public/AB6AXuABY7B_N4oBZcuM5qdFaBEK8kO6iE8IuvNUKUNwg6dObKJiJOdaHHKmXKOZG22ZYkK5YDggzwQrb9_5PwVb_fle00AEQy1xgpzKjkitAK7zKx_wNyYmXgBiNCe1Fhr40NyVLdms8eSZWJt3sHEkOlgegnt0RnEFkOLH0EXMEPdo7vqIlqKM8pyHnnejx4tb1vKVzBixSb7U2aQZ5U7Xx2oO_DGnI_t88A9gQjdIWPfDkusZhuechswEAgE4tJeHbWPuSQ">
        </div>
    </div>
</body>
</html>
`;

export default function SplashScreen({ onFinish }: SplashScreenProps) {
    return (
        <View style={styles.container}>
            <WebView
                originWhitelist={['*']}
                source={{ html: splashHtml }}
                style={styles.webview}
                scrollEnabled={false}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#1b4332',
    },
    webview: {
        flex: 1,
        backgroundColor: 'transparent',
    },
});
