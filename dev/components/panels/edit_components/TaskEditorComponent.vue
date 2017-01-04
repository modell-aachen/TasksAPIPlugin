<template>
    <textarea ref="textarea"></textarea>
    }
</div>
</template>

<script>
/* global foswiki $ */
import MetaFieldMixin from '../../../mixins/MetaFieldMixin.vue';
export default {
    mixins: [MetaFieldMixin],
    mounted(){
        let self = this;
        let $textarea = $(this.$refs.textarea);
        let editorConfig = foswiki.getPreference( 'ckeditor4' ).config.taskeditor;
        $textarea.ckeditor(editorConfig)
        .on('instanceReady.ckeditor', function(evt,ed){
            ed.on("change", function(){
                self.fields[self.fieldName].value = ed.getData();
            });
        });
    }
};
</script>

<style lang="sass">
</style>
