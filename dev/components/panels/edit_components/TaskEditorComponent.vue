<template>
<div class="cke-component">
    <div v-show="isInitializing" class="loading-placeholder">
        <i class="loading-indicator fa fa-refresh fa-spin fa-3x fa-fw"></i>
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
    margin: 0 0 1rem;
    .loading-placeholder {
        background-color: rgba(192,192,192,0.2);
        border-radius: 4px;
        height: 200px;
        text-align: center;
        .loading-indicator {
            position: relative;
            top: 45%;
        }
    }
}
</style>
