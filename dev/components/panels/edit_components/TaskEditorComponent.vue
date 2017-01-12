<template>
<div class="cke-component">
    <div v-show="isInitializing" class="loading-placeholder">
        <div class="cke-placeholder">
            <div class="cke-menu-placeholder"></div>
            <div class="cke-menu-placeholder"></div>
            <div class="cke-menu-placeholder"></div>
            <div class="cke-menu-placeholder"></div>
        </div>
        <div style="width:100%; height:100%">
            <i class="loading-indicator fa fa-refresh fa-spin fa-3x fa-fw"></i>
        </div>
    </div>
    <div v-show="!isInitializing">
        <textarea ref="textarea"></textarea>
    </div>
</div>
</template>

<script>
/* global foswiki $ */
import MetaFieldMixin from '../../../mixins/MetaFieldMixin.vue';
export default {
    mixins: [MetaFieldMixin],
    data(){
        return {
            isInitializing: true
        };
    },
    mounted(){
        let self = this;
        let $textarea = $(this.$refs.textarea);
        let editorConfig = foswiki.getPreference( 'ckeditor4' ).config.taskeditor;
        $textarea.ckeditor(editorConfig)
        .on('instanceReady.ckeditor', function(evt,ed){
            ed.setData(self.fields[self.fieldName].value, {callback: function() {
              this.resetUndo();
              this.resetDirty();
              self.isInitializing = false;
            }});
            ed.on("change", function(){
                self.fields[self.fieldName].value = ed.getData();
            });
        });
    }
};
</script>

<style scoped lang="sass">
.cke-component {
    .loading-placeholder {
        animation-name: pulse;
      animation-duration: 1s; 
      animation-timing-function: linear; 
      animation-delay: 0;
      animation-direction: alternate;
      animation-iteration-count: infinite;
      animation-fill-mode: none;
      animation-play-state: running;
        background-color: rgba(255,255,255,0.2);
        border-radius: 4px;
        height: 200px;
        text-align: center;
        padding: 0;
        border: 1px solid gray;
        opacity: 0.3;
        .cke-placeholder {
            height: 35px;
            /* background-color: blue; */
            text-align: left;
            /* margin: 2px; */
            border-bottom: 1px solid gray;
        }
        .cke-menu-placeholder {
            width: 50px;
            height: 20px;
            margin: 6px;
            display: inline-block;
            border: 1px solid gray;
        }
        .loading-indicator {
            position: relative;
            top: 30%;
            color: #84878A;
        }
        @keyframes pulse {
            0% {
                opacity: 0.1;
              }
              100% {
                opacity: 0.7;
              }
        }
    }
}
</style>
