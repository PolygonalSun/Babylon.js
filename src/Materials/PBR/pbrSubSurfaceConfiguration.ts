import { Nullable } from "../../types";
import { IAnimatable } from "../../Misc/tools";
import { SerializationHelper, serialize, serializeAsTexture, expandToProperty, serializeAsColor3 } from "../../Misc/decorators";
import { Color3 } from "../../Maths/math";
import { SmartArray } from "../../Misc/smartArray";
import { BaseTexture } from "../../Materials/Textures/baseTexture";
import { RenderTargetTexture } from "../../Materials/Textures/renderTargetTexture";
import { Effect, EffectFallbacks } from "../../Materials/effect";
import { MaterialFlags } from "../materialFlags";
import { UniformBuffer } from "../../Materials/uniformBuffer";
import { MaterialHelper } from "../../Materials/materialHelper";

declare type Engine = import("../../Engines/engine").Engine;
declare type Scene = import("../../scene").Scene;

/**
 * @hidden
 */
export interface IMaterialSubSurfaceDefines {
    SUBSURFACE: boolean;

    SS_REFRACTION: boolean;
    SS_TRANSLUCENCY: boolean;
    SS_SCATERRING: boolean;

    SS_THICKNESSANDMASK_TEXTURE: boolean;
    SS_THICKNESSANDMASK_TEXTUREDIRECTUV: number;

    SS_REFRACTIONMAP_3D: boolean;
    SS_REFRACTIONMAP_OPPOSITEZ: boolean;
    SS_LODINREFRACTIONALPHA: boolean;
    SS_GAMMAREFRACTION: boolean;
    SS_RGBDREFRACTION: boolean;
    SS_LINKREFRACTIONTOTRANSPARENCY: boolean;

    SS_MASK_FROM_THICKNESS_TEXTURE: boolean;

    /** @hidden */
    _areTexturesDirty: boolean;
}

/**
 * Define the code related to the sub surface parameters of the pbr material.
 */
export class PBRSubSurfaceConfiguration {
    @serialize()
    private _isRefractionEnabled = false;
    /**
     * Defines if the refraction is enabled in the material.
     */
    @expandToProperty("_markAllSubMeshesAsTexturesDirty")
    public isRefractionEnabled = false;

    @serialize()
    private _isTranslucencyEnabled = false;
    /**
     * Defines if the translucency is enabled in the material.
     */
    @expandToProperty("_markAllSubMeshesAsTexturesDirty")
    public isTranslucencyEnabled = false;

    @serialize()
    private _isScatteringEnabled = false;
    // /**
    //  * Defines if the sub surface scattering is enabled in the material.
    //  */
    // @expandToProperty("_markAllSubMeshesAsTexturesDirty")
    // public isScatteringEnabled = false;

    /**
     * Defines the refraction intensity of the material.
     * The refraction when enabled replaces the Diffuse part of the material.
     * The intensity helps transitionning between diffuse and refraction.
     */
    @serialize()
    public refractionIntensity: number = 1;

    /**
     * Defines the translucency intensity of the material.
     * When translucency has been enabled, this defines how much of the "translucency"
     * is addded to the diffuse part of the material.
     */
    @serialize()
    public translucencyIntensity: number = 1;

    /**
     * Defines the scattering intensity of the material.
     * When scattering has been enabled, this defines how much of the "scattered light"
     * is addded to the diffuse part of the material.
     */
    @serialize()
    public scatteringIntensity: number = 1;

    @serializeAsTexture()
    private _thicknessTexture: Nullable<BaseTexture> = null;
    /**
     * Stores the average thickness of a mesh in a texture (The texture is holding the values linearly).
     * The red channel of the texture should contain the thickness remapped between 0 and 1.
     * 0 would mean minimumThickness
     * 1 would mean maximumThickness
     * The other channels might be use as a mask to vary the different effects intensity.
     */
    @expandToProperty("_markAllSubMeshesAsTexturesDirty")
    public thicknessTexture: Nullable<BaseTexture> = null;

    private _refractionTexture: Nullable<BaseTexture> = null;
    /**
     * Defines the texture to use for refraction.
     */
    @serializeAsTexture()
    @expandToProperty("_markAllSubMeshesAsTexturesDirty")
    public refractionTexture: Nullable<BaseTexture> = null;

    private _indexOfRefraction = 1;
    /**
     * Defines the indice of refraction used in the material.
     * https://en.wikipedia.org/wiki/List_of_refractive_indices
     */
    @serialize()
    @expandToProperty("_markAllSubMeshesAsTexturesDirty")
    public indexOfRefraction = 1;

    private _invertRefractionY = false;
    /**
     * Controls if refraction needs to be inverted on Y. This could be useful for procedural texture.
     */
    @serialize()
    @expandToProperty("_markAllSubMeshesAsTexturesDirty")
    public invertRefractionY = false;

    private _linkRefractionWithTransparency = false;
    /**
     * This parameters will make the material used its opacity to control how much it is refracting aginst not.
     * Materials half opaque for instance using refraction could benefit from this control.
     */
    @serialize()
    @expandToProperty("_markAllSubMeshesAsTexturesDirty")
    public linkRefractionWithTransparency = false;

    /**
     * Defines the minimum thickness stored in the thickness map.
     * If no thickness map is defined, this value will be used to simulate thickness.
     */
    @serialize()
    public minimumThickness: number = 0;

    /**
     * Defines the maximum thickness stored in the thickness map.
     */
    @serialize()
    public maximumThickness: number = 1;

    /**
     * Defines the volume tint of the material.
     * This is used for both translucency and scattering.
     */
    @serializeAsColor3()
    public tintColor = Color3.White();

    /**
     * Defines the distance at which the tint color should be found in the media.
     * This is used for refraction only.
     */
    @serialize()
    public tintColorAtDistance = 1;

    /**
     * Defines how far each channel transmit through the media.
     * It is defined as a color to simplify it selection.
     */
    @serializeAsColor3()
    public diffusionDistance = Color3.White();

    @serialize()
    private _useMaskFromThicknessTexture = false;
    /**
     * Stores the intensity of the different subsurface effects in the thickness texture.
     * * the green channel is the translucency intensity.
     * * the blue channel is the scattering intensity.
     * * the alpha channel is the refraction intensity.
     */
    @expandToProperty("_markAllSubMeshesAsTexturesDirty")
    public useMaskFromThicknessTexture: boolean = false;

    /** @hidden */
    private _internalMarkAllSubMeshesAsTexturesDirty: () => void;

    /** @hidden */
    public _markAllSubMeshesAsTexturesDirty(): void {
        this._internalMarkAllSubMeshesAsTexturesDirty();
    }

    /**
     * Instantiate a new istance of sub surface configuration.
     * @param markAllSubMeshesAsTexturesDirty Callback to flag the material to dirty
     */
    constructor(markAllSubMeshesAsTexturesDirty: () => void) {
        this._internalMarkAllSubMeshesAsTexturesDirty = markAllSubMeshesAsTexturesDirty;
    }

    /**
     * Gets wehter the submesh is ready to be used or not.
     * @param defines the list of "defines" to update.
     * @param scene defines the scene the material belongs to.
     * @returns - boolean indicating that the submesh is ready or not.
     */
    public isReadyForSubMesh(defines: IMaterialSubSurfaceDefines, scene: Scene): boolean {
        if (defines._areTexturesDirty) {
            if (scene.texturesEnabled) {
                if (this._thicknessTexture && MaterialFlags.ThicknessTextureEnabled) {
                    if (!this._thicknessTexture.isReadyOrNotBlocking()) {
                        return false;
                    }
                }

                var refractionTexture = this._getRefractionTexture(scene);
                if (refractionTexture && MaterialFlags.RefractionTextureEnabled) {
                    if (!refractionTexture.isReadyOrNotBlocking()) {
                        return false;
                    }
                }
            }
        }

        return true;
    }

    /**
     * Checks to see if a texture is used in the material.
     * @param defines the list of "defines" to update.
     * @param scene defines the scene to the material belongs to.
     */
    public prepareDefines(defines: IMaterialSubSurfaceDefines, scene: Scene): void {
        if (defines._areTexturesDirty) {
            defines.SUBSURFACE = false;

            defines.SS_TRANSLUCENCY = this._isTranslucencyEnabled;
            defines.SS_SCATERRING = this._isScatteringEnabled;
            defines.SS_THICKNESSANDMASK_TEXTURE = false;
            defines.SS_MASK_FROM_THICKNESS_TEXTURE = false;
            defines.SS_REFRACTION = false;
            defines.SS_REFRACTIONMAP_3D = false;
            defines.SS_GAMMAREFRACTION = false;
            defines.SS_RGBDREFRACTION = false;
            defines.SS_REFRACTIONMAP_OPPOSITEZ = false;
            defines.SS_LODINREFRACTIONALPHA = false;
            defines.SS_LINKREFRACTIONTOTRANSPARENCY = false;

            if (this._isRefractionEnabled || this._isTranslucencyEnabled || this._isScatteringEnabled) {
                defines.SUBSURFACE = true;

                if (defines._areTexturesDirty) {
                    if (scene.texturesEnabled) {
                        if (this._thicknessTexture && MaterialFlags.ThicknessTextureEnabled) {
                            MaterialHelper.PrepareDefinesForMergedUV(this._thicknessTexture, defines, "SS_THICKNESSANDMASK_TEXTURE");
                        }
                    }
                }

                defines.SS_MASK_FROM_THICKNESS_TEXTURE = this._useMaskFromThicknessTexture;
            }

            if (this._isRefractionEnabled) {
                if (scene.texturesEnabled) {
                    var refractionTexture = this._getRefractionTexture(scene);
                    if (refractionTexture && MaterialFlags.RefractionTextureEnabled) {
                        defines.SS_REFRACTION = true;
                        defines.SS_REFRACTIONMAP_3D = refractionTexture.isCube;
                        defines.SS_GAMMAREFRACTION = refractionTexture.gammaSpace;
                        defines.SS_RGBDREFRACTION = refractionTexture.isRGBD;
                        defines.SS_REFRACTIONMAP_OPPOSITEZ = refractionTexture.invertZ;
                        defines.SS_LODINREFRACTIONALPHA = refractionTexture.lodLevelInAlpha;
                        defines.SS_LINKREFRACTIONTOTRANSPARENCY = this._linkRefractionWithTransparency;
                    }
                }
            }
        }
    }

    /**
     * Binds the material data.
     * @param uniformBuffer defines the Uniform buffer to fill in.
     * @param scene defines the scene the material belongs to.
     * @param engine defines the engine the material belongs to.
     * @param isFrozen defines wether the material is frozen or not.
     * @param lodBasedMicrosurface defines wether the material relies on lod based microsurface or not.
     */
    public bindForSubMesh(uniformBuffer: UniformBuffer, scene: Scene, engine: Engine, isFrozen: boolean, lodBasedMicrosurface: boolean): void {
        var refractionTexture = this._getRefractionTexture(scene);

        if (!uniformBuffer.useUbo || !isFrozen || !uniformBuffer.isSync) {
            if (this._thicknessTexture && MaterialFlags.ThicknessTextureEnabled) {
                uniformBuffer.updateFloat2("vThicknessInfos", this._thicknessTexture.coordinatesIndex, this._thicknessTexture.level);
                MaterialHelper.BindTextureMatrix(this._thicknessTexture, uniformBuffer, "thickness");
            }

            uniformBuffer.updateFloat2("vThicknessParam", this.minimumThickness, this.maximumThickness - this.minimumThickness);

            if (refractionTexture && MaterialFlags.RefractionTextureEnabled) {
                uniformBuffer.updateMatrix("refractionMatrix", refractionTexture.getReflectionTextureMatrix());

                var depth = 1.0;
                if (!refractionTexture.isCube) {
                    if ((<any>refractionTexture).depth) {
                        depth = (<any>refractionTexture).depth;
                    }
                }
                uniformBuffer.updateFloat4("vRefractionInfos", refractionTexture.level, 1 / this._indexOfRefraction, depth, this._invertRefractionY ? -1 : 1);
                uniformBuffer.updateFloat3("vRefractionMicrosurfaceInfos",
                    refractionTexture.getSize().width,
                    refractionTexture.lodGenerationScale,
                    refractionTexture.lodGenerationOffset);
            }

            uniformBuffer.updateColor3("vDiffusionDistance", this.diffusionDistance);

            uniformBuffer.updateFloat4("vTintColor", this.tintColor.r,
                this.tintColor.g,
                this.tintColor.b,
                this.tintColorAtDistance);

            uniformBuffer.updateFloat3("vSubSurfaceIntensity", this.refractionIntensity, this.translucencyIntensity, this.scatteringIntensity);
        }

        // Textures
        if (scene.texturesEnabled) {
            if (this._thicknessTexture && MaterialFlags.ThicknessTextureEnabled) {
                uniformBuffer.setTexture("thicknessSampler", this._thicknessTexture);
            }

            if (refractionTexture && MaterialFlags.RefractionTextureEnabled) {
                if (lodBasedMicrosurface) {
                    uniformBuffer.setTexture("refractionSampler", refractionTexture);
                }
                else {
                    uniformBuffer.setTexture("refractionSampler", refractionTexture._lodTextureMid || refractionTexture);
                    uniformBuffer.setTexture("refractionSamplerLow", refractionTexture._lodTextureLow || refractionTexture);
                    uniformBuffer.setTexture("refractionSamplerHigh", refractionTexture._lodTextureHigh || refractionTexture);
                }
            }
        }
    }

    /**
     * Unbinds the material from the mesh.
     * @param activeEffect defines the effect that should be unbound from.
     * @returns true if unbound, otherwise false
     */
    public unbind(activeEffect: Effect): boolean {
        if (this._refractionTexture && this._refractionTexture.isRenderTarget) {
            activeEffect.setTexture("refractionSampler", null);
            return true;
        }

        return false;
    }

    /**
     * Returns the texture used for refraction or null if none is used.
     * @param scene defines the scene the material belongs to.
     * @returns - Refraction texture if present.  If no refraction texture and refraction
     * is linked with transparency, returns environment texture.  Otherwise, returns null.
     */
    private _getRefractionTexture(scene: Scene): Nullable<BaseTexture> {
        if (this._refractionTexture) {
            return this._refractionTexture;
        }

        if (this._isRefractionEnabled) {
            return scene.environmentTexture;
        }

        return null;
    }

    /**
     * Returns true if alpha blending should be disabled.
     */
    public get disableAlphaBlending(): boolean {
        return this.isRefractionEnabled && this._linkRefractionWithTransparency;
    }

    /**
     * Fills the list of render target textures.
     * @param renderTargets the list of render targets to update
     */
    public fillRenderTargetTextures(renderTargets: SmartArray<RenderTargetTexture>): void {
        if (MaterialFlags.RefractionTextureEnabled && this._refractionTexture && this._refractionTexture.isRenderTarget) {
            renderTargets.push(<RenderTargetTexture>this._refractionTexture);
        }
    }

    /**
     * Checks to see if a texture is used in the material.
     * @param texture - Base texture to use.
     * @returns - Boolean specifying if a texture is used in the material.
     */
    public hasTexture(texture: BaseTexture): boolean {
        if (this._thicknessTexture === texture) {
            return true;
        }

        if (this._refractionTexture === texture) {
            return true;
        }

        return false;
    }

    /**
     * Gets a boolean indicating that current material needs to register RTT
     * @returns true if this uses a render target otherwise false.
     */
    public hasRenderTargetTextures(): boolean {
        if (MaterialFlags.RefractionTextureEnabled && this._refractionTexture && this._refractionTexture.isRenderTarget) {
            return true;
        }

        return false;
    }

    /**
     * Returns an array of the actively used textures.
     * @param activeTextures Array of BaseTextures
     */
    public getActiveTextures(activeTextures: BaseTexture[]): void {
        if (this._thicknessTexture) {
            activeTextures.push(this._thicknessTexture);
        }

        if (this._refractionTexture) {
            activeTextures.push(this._refractionTexture);
        }
    }

    /**
     * Returns the animatable textures.
     * @param animatables Array of animatable textures.
     */
    public getAnimatables(animatables: IAnimatable[]): void {
        if (this._thicknessTexture && this._thicknessTexture.animations && this._thicknessTexture.animations.length > 0) {
            animatables.push(this._thicknessTexture);
        }

        if (this._refractionTexture && this._refractionTexture.animations && this._refractionTexture.animations.length > 0) {
            animatables.push(this._refractionTexture);
        }
    }

    /**
     * Disposes the resources of the material.
     * @param forceDisposeTextures - Forces the disposal of all textures.
     */
    public dispose(forceDisposeTextures?: boolean): void {
        if (forceDisposeTextures) {
            if (this._thicknessTexture) {
                this._thicknessTexture.dispose();
            }

            if (this._refractionTexture) {
                this._refractionTexture.dispose();
            }
        }
    }

    /**
    * Get the current class name of the texture useful for serialization or dynamic coding.
    * @returns "PBRSubSurfaceConfiguration"
    */
    public getClassName(): string {
        return "PBRSubSurfaceConfiguration";
    }

    /**
     * Add fallbacks to the effect fallbacks list.
     * @param defines defines the Base texture to use.
     * @param fallbacks defines the current fallback list.
     * @param currentRank defines the current fallback rank.
     * @returns the new fallback rank.
     */
    public static AddFallbacks(defines: IMaterialSubSurfaceDefines, fallbacks: EffectFallbacks, currentRank: number): number {
        if (defines.SS_SCATERRING) {
            fallbacks.addFallback(currentRank++, "SS_SCATERRING");
        }
        if (defines.SS_TRANSLUCENCY) {
            fallbacks.addFallback(currentRank++, "SS_TRANSLUCENCY");
        }
        return currentRank;
    }

    /**
     * Add the required uniforms to the current list.
     * @param uniforms defines the current uniform list.
     */
    public static AddUniforms(uniforms: string[]): void {
        uniforms.push(
            "vDiffusionDistance", "vTintColor", "vSubSurfaceIntensity",
            "vRefractionMicrosurfaceInfos",
            "vRefractionInfos", "vThicknessInfos", "vThicknessParam",
            "refractionMatrix", "thicknessMatrix");
    }

    /**
     * Add the required samplers to the current list.
     * @param samplers defines the current sampler list.
     */
    public static AddSamplers(samplers: string[]): void {
        samplers.push("thicknessSampler",
            "refractionSampler", "refractionSamplerLow", "refractionSamplerHigh");
    }

    /**
     * Add the required uniforms to the current buffer.
     * @param uniformBuffer defines the current uniform buffer.
     */
    public static PrepareUniformBuffer(uniformBuffer: UniformBuffer): void {
        uniformBuffer.addUniform("vRefractionMicrosurfaceInfos", 3);
        uniformBuffer.addUniform("vRefractionInfos", 4);
        uniformBuffer.addUniform("refractionMatrix", 16);
        uniformBuffer.addUniform("vThicknessInfos", 2);
        uniformBuffer.addUniform("thicknessMatrix", 16);
        uniformBuffer.addUniform("vThicknessParam", 2);
        uniformBuffer.addUniform("vDiffusionDistance", 3);
        uniformBuffer.addUniform("vTintColor", 4);
        uniformBuffer.addUniform("vSubSurfaceIntensity", 3);
    }

    /**
     * Makes a duplicate of the current configuration into another one.
     * @param configuration define the config where to copy the info
     */
    public copyTo(configuration: PBRSubSurfaceConfiguration): void {
        SerializationHelper.Clone(() => configuration, this);
    }

    /**
     * Serializes this Sub Surface configuration.
     * @returns - An object with the serialized config.
     */
    public serialize(): any {
        return SerializationHelper.Serialize(this);
    }

    /**
     * Parses a Sub Surface Configuration from a serialized object.
     * @param source - Serialized object.
     */
    public parse(source: any): void {
        SerializationHelper.Parse(() => this, source, null);
    }
}