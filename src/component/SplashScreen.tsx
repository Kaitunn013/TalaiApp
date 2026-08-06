import React from 'react';
import { StyleSheet, View, Image } from 'react-native';

interface SplashScreenProps {
    onFinish?: () => void;
}

const LOGO_URI = 'https://lh3.googleusercontent.com/aida-public/AB6AXuABY7B_N4oBZcuM5qdFaBEK8kO6iE8IuvNUKUNwg6dObKJiJOdaHHKmXKOZG22ZYkK5YDggzwQrb9_5PwVb_fle00AEQy1xgpzKjkitAK7zKx_wNyYmXgBiNCe1Fhr40NyVLdms8eSZWJt3sHEkOlgegnt0RnEFkOLH0EXMEPdo7vqIlqKM8pyHnnejx4tb1vKVzBixSb7U2aQZ5U7Xx2oO_DGnI_t88A9gQjdIWPfDkusZhuechswEAgE4tJeHbWPuSQ';

export default function SplashScreen({ onFinish }: SplashScreenProps) {
    return (
        <View style={styles.container}>
            <View style={styles.logoWrapper}>
                <Image
                    source={{ uri: LOGO_URI }}
                    style={styles.logo}
                    resizeMode="contain"
                />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#a0ca8bff',
        alignItems: 'center',
        justifyContent: 'center',
    },
    logoWrapper: {
        width: 220,
        height: 220,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
    },
    logo: {
        width: 350,
        height: 350,
    },
});


