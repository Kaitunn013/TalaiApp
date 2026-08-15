import React from 'react';
import { StyleSheet, View, Image } from 'react-native';

interface SplashScreenProps {
    onFinish?: () => void;
}

const LOGO_SOURCE = require('../../assets/APP_ICON.png');

export default function SplashScreen({ onFinish }: SplashScreenProps) {
    return (
        <View style={styles.container}>
            <View style={styles.logoWrapper}>
                <Image
                    source={LOGO_SOURCE}
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


