'use client';
import {useEffect,useSyncExternalStore} from 'react';
import {getServerUi,getUi,initUi,subscribeUi,type Lang,type ThemePref,type UiPrefs} from './store';

export type {Lang,ThemePref};
/** Suscribe el componente al idioma/tema globales (y los carga de localStorage al montar la primera vez). */
export function useUi():UiPrefs{
 const ui=useSyncExternalStore(subscribeUi,getUi,getServerUi);
 useEffect(()=>{initUi();},[]);
 return ui;
}
